"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { tablesDB } from "@/lib/appwrite/client";
import { appwriteConfig } from "@/lib/appwrite/config";
import { createLeadsReader, validLeadId, type LeadDetailState, type ReadFailure } from "@/lib/admin/leads";
import { initialLeadQuery, normalizeLeadQuery, nearestPage, LEADS_PAGE_SIZE, SEARCH_DEBOUNCE_MS, type LeadQuery } from "@/lib/admin/lead-queries";
import { createDashboardReader, type DashboardSummary } from "@/lib/admin/dashboard";
import { createLeadMutations, emptyMutation, mutationMessages, type LeadMutation, type MutationState } from "@/lib/admin/lead-mutations";
import type { Lead } from "@/lib/admin/types";
import { useAdminAuth } from "./AdminAuthProvider";

const reader = createLeadsReader({ tablesDB, config: appwriteConfig });
const writer = createLeadMutations({ tablesDB, config: appwriteConfig });
const dashboardReader = createDashboardReader({ tablesDB, config: appwriteConfig });
type PageState = { leads: Lead[]; total: number; loading: boolean; initialized: boolean; error: string; warning: string; appliedQuery: LeadQuery };
type DashboardState = { summary: DashboardSummary | null; loading: boolean; initialized: boolean; error: string };
type OpenState = { leads: Lead[]; total: number; loading: boolean; initialized: boolean; error: string };
const emptyPage = (): PageState => ({ leads: [], total: 0, loading: false, initialized: false, error: "", warning: "", appliedQuery: initialLeadQuery });
const emptyDashboard = (): DashboardState => ({ summary: null, loading: false, initialized: false, error: "" });
const emptyOpen = (): OpenState => ({ leads: [], total: 0, loading: false, initialized: false, error: "" });
type ContextValue = PageState & {
  ready: boolean;
  query: LeadQuery; searchDraft: string; searchPending: boolean; pageSize: number;
  ensureList: () => Promise<void>; refreshLeads: () => Promise<void>;
  setSearch: (value: string) => void; setFilters: (values: Partial<Pick<LeadQuery, "status" | "service" | "date">>) => void;
  setPage: (page: number) => void; clearFilters: () => void;
  dashboard: DashboardState; openLeads: OpenState;
  ensureDashboard: () => Promise<void>; refreshDashboard: () => Promise<void>; ensureOpenLeads: () => Promise<void>; refreshOpenLeads: () => Promise<void>;
  ensureLead: (id: string, retry?: boolean) => Promise<void>; getLeadState: (id: string) => LeadDetailState;
  getMutationState: (id: string) => MutationState;
  updateLeadStatus: (id: string, status: string) => Promise<boolean>;
  addLeadNote: (id: string, newNote: string) => Promise<boolean>; softDeleteLead: (id: string) => Promise<boolean>;
  hasPendingMutations: boolean; notice: string;
};
const Context = createContext<ContextValue | null>(null);

export default function LeadsProvider({ children }: { children: ReactNode }) {
  const { state: auth, recheckSession } = useAdminAuth();
  const userId = auth.status === "authorized" ? auth.user.$id : "";
  const identity = useRef(userId); identity.current = userId;
  const owner = useRef(userId), epoch = useRef(0), sessionChecked = useRef(false), sessionError = useRef("");
  const listRequest = useRef(0), dashboardRequest = useRef(0), openRequest = useRef(0);
  const wanted = useRef({ list: false, dashboard: false, open: false });
  const queued = useRef({ list: false, dashboard: false, open: false });
  const [page, setPageState] = useState<PageState>(emptyPage); const pageCache = useRef(page);
  const [query, setQueryState] = useState<LeadQuery>(initialLeadQuery); const queryCache = useRef(query);
  const [searchDraft, setSearchDraft] = useState(""); const [searchPending, setSearchPending] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard); const dashboardCache = useRef(dashboard);
  const [openLeads, setOpenLeads] = useState<OpenState>(emptyOpen); const openCache = useRef(openLeads);
  const [details, setDetails] = useState<Record<string, LeadDetailState>>({}); const detailCache = useRef(details);
  const detailVersions = useRef(new Map<string, number>()), pendingDetails = useRef(new Map<string, symbol>());
  const [mutations, setMutations] = useState<Record<string, MutationState>>({}); const mutationCache = useRef(mutations);
  const locks = useRef(new Map<string, symbol>()); const [notice, setNotice] = useState("");
  const savePage = (next: PageState) => { pageCache.current = next; setPageState(next); };
  const saveDashboard = (next: DashboardState) => { dashboardCache.current = next; setDashboard(next); };
  const saveOpen = (next: OpenState) => { openCache.current = next; setOpenLeads(next); };
  const storeDetail = (id: string, next: LeadDetailState) => { detailCache.current = { ...detailCache.current, [id]: next }; setDetails(detailCache.current); };
  const saveMutation = (id: string, next: MutationState) => { mutationCache.current = { ...mutationCache.current, [id]: next }; setMutations(mutationCache.current); };
  const authorized = () => Boolean(userId && owner.current === userId && identity.current === userId);
  const cancelSearch = () => { if (searchTimer.current !== null) clearTimeout(searchTimer.current); searchTimer.current = null; setSearchPending(false); };
  const invalidate = () => { epoch.current++; listRequest.current++; dashboardRequest.current++; openRequest.current++; locks.current.clear(); pendingDetails.current.clear(); cancelSearch(); };
  const clearPrivate = () => { detailCache.current = {}; setDetails({}); detailVersions.current.clear(); mutationCache.current = {}; setMutations({}); setNotice(""); };
  const handleSession = useCallback(async (failure: ReadFailure) => {
    if (failure.kind !== "session") return;
    invalidate(); clearPrivate(); sessionError.current = failure.message;
    queued.current = { list: false, dashboard: false, open: false };
    savePage({ ...emptyPage(), initialized: true, error: failure.message });
    saveDashboard({ ...emptyDashboard(), initialized: true, error: failure.message });
    saveOpen({ ...emptyOpen(), initialized: true, error: failure.message });
    if (!sessionChecked.current) { sessionChecked.current = true; await recheckSession(); }
  }, [recheckSession]);

  const refreshLeads = useCallback(async () => {
    wanted.current.list = true;
    if (!authorized()) return;
    if (locks.current.size) { queued.current.list = true; return; }
    sessionError.current = ""; queued.current.list = false;
    const request = ++listRequest.current, lifetime = epoch.current;
    let selected = queryCache.current;
    const isCurrent = () => authorized() && epoch.current === lifetime && request === listRequest.current;
    savePage({ ...pageCache.current, loading: true, error: "" });
    // At most one corrective fetch, even if the database changes again.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await reader.list(selected);
      if (!isCurrent()) return;
      if (!result.ok) { savePage({ ...pageCache.current, loading: false, initialized: true, error: result.message }); await handleSession(result); return; }
      const corrected = nearestPage(selected.page, result.total);
      if (corrected !== selected.page) {
        selected = { ...selected, page: corrected }; queryCache.current = selected; setQueryState(selected);
        if (attempt === 0) continue;
        savePage({ ...pageCache.current, leads: [], total: result.total, loading: false, initialized: true, appliedQuery: selected, error: "Results changed while loading. Please refresh leads." }); return;
      }
      const active = result.leads.filter(lead => detailCache.current[lead.id]?.status !== "notFound");
      sessionChecked.current = false;
      for (const lead of active) if (!pendingDetails.current.has(lead.id)) storeDetail(lead.id, { status: "loaded", lead });
      savePage({ leads: active, total: result.total, loading: false, initialized: true, error: "", warning: result.warning || "", appliedQuery: selected });
      return;
    }
  }, [userId, handleSession]);

  const refreshDashboard = useCallback(async () => {
    wanted.current.dashboard = true;
    if (!authorized()) return;
    if (locks.current.size) { queued.current.dashboard = true; return; }
    queued.current.dashboard = false;
    const request = ++dashboardRequest.current, lifetime = epoch.current;
    saveDashboard({ ...dashboardCache.current, loading: true, error: "" });
    const result = await dashboardReader.summary();
    if (!authorized() || lifetime !== epoch.current || request !== dashboardRequest.current) return;
    if (!result.ok) { saveDashboard({ ...dashboardCache.current, loading: false, initialized: true, error: result.message }); await handleSession(result); return; }
    // Display-only recent rows must not overwrite confirmed detail data.
    const recent = result.summary.recent.map(lead => {
      const cached = detailCache.current[lead.id]; return cached?.status === "loaded" && Date.parse(cached.lead.updatedAt) >= Date.parse(lead.updatedAt) ? cached.lead : lead;
    }).filter(lead => detailCache.current[lead.id]?.status !== "notFound");
    sessionChecked.current = false;
    saveDashboard({ summary: { ...result.summary, recent }, loading: false, initialized: true, error: "" });
  }, [userId, handleSession]);

  const refreshOpen = useCallback(async () => {
    wanted.current.open = true;
    if (!authorized()) return;
    if (locks.current.size) { queued.current.open = true; return; }
    queued.current.open = false;
    const request = ++openRequest.current, lifetime = epoch.current;
    saveOpen({ ...openCache.current, loading: true, error: "" });
    const result = await dashboardReader.open();
    if (!authorized() || lifetime !== epoch.current || request !== openRequest.current) return;
    if (!result.ok) { saveOpen({ ...openCache.current, loading: false, initialized: true, error: result.message }); await handleSession(result); return; }
    sessionChecked.current = false;
    saveOpen({ leads: result.leads, total: result.total, loading: false, initialized: true, error: "" });
  }, [userId, handleSession]);

  useEffect(() => {
    if (owner.current !== userId) {
      invalidate(); clearPrivate(); owner.current = userId; sessionChecked.current = false; sessionError.current = "";
      queryCache.current = initialLeadQuery; setQueryState(initialLeadQuery); setSearchDraft("");
      savePage(emptyPage()); saveDashboard(emptyDashboard()); saveOpen(emptyOpen());
    }
    if (userId) {
      if (wanted.current.list && !pageCache.current.initialized && !pageCache.current.loading) void refreshLeads();
      if (wanted.current.dashboard && !dashboardCache.current.initialized && !dashboardCache.current.loading) void refreshDashboard();
      if (wanted.current.open && !openCache.current.initialized && !openCache.current.loading) void refreshOpen();
    }
    return () => {
      invalidate();
      // Allow Strict Mode's replayed consumer effects to restart invalidated reads.
      if (pageCache.current.loading) pageCache.current = { ...pageCache.current, loading: false, initialized: false };
      if (dashboardCache.current.loading) dashboardCache.current = { ...dashboardCache.current, loading: false, initialized: false };
      if (openCache.current.loading) openCache.current = { ...openCache.current, loading: false, initialized: false };
    };
  }, [userId, refreshLeads, refreshDashboard, refreshOpen]);

  const applyQuery = (next: Partial<LeadQuery>) => {
    listRequest.current++;
    try { const normalized = normalizeLeadQuery(next); queryCache.current = normalized; setQueryState(normalized); void refreshLeads(); }
    catch { savePage({ ...pageCache.current, loading: false, initialized: true, error: "Please choose valid lead filters." }); }
  };
  const setSearch = (value: string) => {
    setSearchDraft(value); cancelSearch();
    if (value.trim() === queryCache.current.search) { if (queued.current.list || pageCache.current.loading) void refreshLeads(); return; }
    listRequest.current++; setSearchPending(true);
    const lifetime = epoch.current;
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null; setSearchPending(false);
      if (authorized() && lifetime === epoch.current) applyQuery({ ...queryCache.current, search: value, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
  };
  const ensureLead = useCallback(async (id: string, retry = false) => {
    if (!authorized() || (sessionError.current && !retry) || !validLeadId(id) || locks.current.has(id) || pendingDetails.current.has(id) || (!retry && detailCache.current[id])) return;
    if (retry) sessionError.current = "";
    const lifetime = epoch.current, version = detailVersions.current.get(id) || 0, token = Symbol(id);
    pendingDetails.current.set(id, token); storeDetail(id, { status: "loading" });
    try {
      const result = await reader.detail(id);
      if (!authorized() || lifetime !== epoch.current || version !== (detailVersions.current.get(id) || 0) || pendingDetails.current.get(id) !== token) return;
      if (!result.ok) { storeDetail(id, { status: "error", message: result.message }); await handleSession(result); return; }
      sessionChecked.current = false;
      storeDetail(id, result.lead ? { status: "loaded", lead: result.lead } : { status: "notFound" });
    } finally { if (pendingDetails.current.get(id) === token) pendingDetails.current.delete(id); }
  }, [userId, handleSession]);

  const flushRefreshes = () => {
    if (!authorized() || locks.current.size) return;
    if (queued.current.list) void refreshLeads();
    if (queued.current.dashboard) void refreshDashboard();
    if (queued.current.open) void refreshOpen();
  };
  const removeLead = (id: string) => {
    // Refetch determines filtered totals/pages. Never guess count arithmetic.
    savePage({ ...pageCache.current, leads: pageCache.current.leads.filter(lead => lead.id !== id) });
    storeDetail(id, { status: "notFound" });
  };
  const mutate = async (id: string, operation: LeadMutation, value?: string): Promise<boolean> => {
    const cached = detailCache.current[id];
    const lead = cached?.status === "loaded" ? cached.lead : pageCache.current.leads.find(row => row.id === id);
    if (!authorized() || sessionError.current || (cached && cached.status !== "loaded") || !lead || lead.deletedAt || locks.current.has(id) || pendingDetails.current.has(id)) return false;
    const newNote = operation === "notes" && typeof value === "string" ? value.trim() : "";
    if (operation === "notes" && !newNote) { saveMutation(id, { operation, pending: false, message: "Please enter a note before saving.", success: false }); return false; }
    const lifetime = epoch.current, token = Symbol(id);
    locks.current.set(id, token); detailVersions.current.set(id, (detailVersions.current.get(id) || 0) + 1);
    if (pageCache.current.loading) { listRequest.current++; queued.current.list = true; }
    setNotice(""); saveMutation(id, { operation, pending: true, message: "", success: false });
    const isCurrent = () => authorized() && lifetime === epoch.current && locks.current.get(id) === token;
    try {
      const existing = lead.notes.trim();
      const result = operation === "status" ? await writer.status(id, value) : operation === "notes" ? await writer.notes(id, existing ? `${existing}\n\n${newNote}` : newNote) : await writer.archive(id);
      if (!isCurrent()) return false;
      if (!result.ok) {
        saveMutation(id, { operation, pending: false, message: result.message, success: false });
        if (result.kind === "session") await handleSession({ ok: false, kind: "session", message: result.message });
        else if (result.kind === "notFound") { removeLead(id); queued.current = { ...wanted.current }; }
        return false;
      }
      if (result.lead.deletedAt) removeLead(id);
      else {
        storeDetail(id, { status: "loaded", lead: result.lead });
        savePage({ ...pageCache.current, leads: pageCache.current.leads.map(item => item.id === id ? result.lead : item) });
        if (dashboardCache.current.summary) saveDashboard({ ...dashboardCache.current, summary: { ...dashboardCache.current.summary, recent: dashboardCache.current.summary.recent.map(item => item.id === id ? result.lead : item) } });
      }
      if (operation !== "notes" || result.lead.deletedAt) {
        listRequest.current++; dashboardRequest.current++; openRequest.current++;
        queued.current = { ...wanted.current };
      }
      if (operation !== "archive" && result.lead.deletedAt) { saveMutation(id, { operation, pending: false, message: mutationMessages.unavailable, success: false }); return false; }
      const message = operation === "status" ? "Lead status updated." : operation === "notes" ? "Note saved." : "Lead archived from active leads.";
      saveMutation(id, { operation, pending: false, message, success: true });
      if (operation === "archive") setNotice(message);
      return true;
    } catch { if (isCurrent()) saveMutation(id, { operation, pending: false, message: mutationMessages[operation], success: false }); return false; }
    finally {
      if (locks.current.get(id) === token) {
        locks.current.delete(id);
        const state = mutationCache.current[id];
        if (state?.pending && authorized() && lifetime === epoch.current) saveMutation(id, { ...state, pending: false });
        flushRefreshes();
      }
    }
  };

  const ensureList = useCallback(async () => { wanted.current.list = true; if (!pageCache.current.initialized && !pageCache.current.loading) await refreshLeads(); }, [refreshLeads]);
  const ensureDashboard = useCallback(async () => { wanted.current.dashboard = true; if (!dashboardCache.current.initialized && !dashboardCache.current.loading) await refreshDashboard(); }, [refreshDashboard]);
  const ensureOpenLeads = useCallback(async () => { wanted.current.open = true; if (!openCache.current.initialized && !openCache.current.loading) await refreshOpen(); }, [refreshOpen]);
  const visible = Boolean(userId && owner.current === userId);
  return <Context.Provider value={{
    ...(visible ? page : emptyPage()), ready: visible, query: visible ? query : initialLeadQuery,
    searchDraft: visible ? searchDraft : "", searchPending: visible && searchPending, pageSize: LEADS_PAGE_SIZE,
    dashboard: visible ? dashboard : emptyDashboard(), openLeads: visible ? openLeads : emptyOpen(),
    ensureList, refreshLeads, ensureDashboard, refreshDashboard, ensureOpenLeads, refreshOpenLeads: refreshOpen,
    setSearch, setFilters: values => applyQuery({ ...queryCache.current, ...values, page: 1 }),
    setPage: value => { if (!pageCache.current.loading && searchTimer.current === null && !locks.current.size) applyQuery({ ...queryCache.current, page: value }); },
    clearFilters: () => { cancelSearch(); setSearchDraft(""); applyQuery(initialLeadQuery); },
    ensureLead, getLeadState: id => !validLeadId(id) ? { status: "notFound" } : !visible ? { status: "loading" } : sessionError.current ? { status: "error", message: sessionError.current } : details[id] || { status: "loading" },
    getMutationState: id => visible ? mutations[id] || emptyMutation : emptyMutation,
    updateLeadStatus: (id, status) => mutate(id, "status", status), addLeadNote: (id, note) => mutate(id, "notes", note), softDeleteLead: id => mutate(id, "archive"),
    hasPendingMutations: visible && Object.values(mutations).some(state => state.pending), notice: visible ? notice : "",
  }}>{children}</Context.Provider>;
}

export function useLeads() {
  const context = useContext(Context);
  if (!context) throw new Error("Leads provider is missing");
  return context;
}
