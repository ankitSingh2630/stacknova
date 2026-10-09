"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { tablesDB } from "@/lib/appwrite/client";
import { appwriteConfig } from "@/lib/appwrite/config";
import { createLeadsReader, validLeadId, type LeadDetailState, type ReadFailure } from "@/lib/admin/leads";
import type { Lead } from "@/lib/admin/types";
import { useAdminAuth } from "./AdminAuthProvider";

const reader = createLeadsReader({ tablesDB, config: appwriteConfig });
type Snapshot = { ownerId: string; leads: Lead[]; total: number; loading: boolean; error: string };
type ContextValue = {
  leads: Lead[]; total: number; loading: boolean; error: string;
  refreshLeads: () => Promise<void>;
  ensureLead: (id: string) => Promise<void>;
  getLeadState: (id: string) => LeadDetailState;
};
const Context = createContext<ContextValue | null>(null);

export default function LeadsProvider({ children }: { children: ReactNode }) {
  const { state: auth, recheckSession } = useAdminAuth();
  const userId = auth.status === "authorized" ? auth.user.$id : "";
  const identity = useRef(userId);
  identity.current = userId;
  const [snapshot, setSnapshot] = useState<Snapshot>({ ownerId: "", leads: [], total: 0, loading: true, error: "" });
  const current = useRef(snapshot);
  const [details, setDetails] = useState<Record<string, LeadDetailState>>({});
  const detailCache = useRef(details);
  const generation = useRef(0);
  const pendingDetails = useRef(new Map<string, number>());
  const sessionChecked = useRef(false);
  const save = (next: Snapshot) => { current.current = next; setSnapshot(next); };
  const clearDetails = () => {
    detailCache.current = {};
    pendingDetails.current.clear();
    setDetails({});
  };
  const storeDetail = (id: string, next: LeadDetailState) => {
    detailCache.current = { ...detailCache.current, [id]: next };
    setDetails(detailCache.current);
  };
  const failRead = useCallback(async (failure: ReadFailure) => {
    // Clear all private data before any identity recheck. Invalidate other reads.
    generation.current += 1;
    clearDetails();
    save({ ownerId: userId, leads: [], total: 0, loading: false, error: failure.message });
    if (failure.kind === "session" && !sessionChecked.current) {
      sessionChecked.current = true;
      await recheckSession();
    }
    // A 403 does not trigger auth changes: the table Read grant may be missing.
    // Neither error retries the database automatically.
  }, [userId, recheckSession]);

  const refreshLeads = useCallback(async () => {
    if (!userId || identity.current !== userId) return;
    const request = ++generation.current;
    sessionChecked.current = false;
    clearDetails();
    save({ ownerId: userId, leads: [], total: 0, loading: true, error: "" });
    const result = await reader.list();
    if (request !== generation.current || identity.current !== userId) return;
    if (!result.ok) { await failRead(result); return; }
    save({ ownerId: userId, leads: result.leads, total: result.total, loading: false, error: "" });
  }, [userId, failRead]);

  useEffect(() => {
    if (userId) void refreshLeads();
    return () => { generation.current += 1; };
  }, [userId, refreshLeads]);

  const ensureLead = useCallback(async (id: string) => {
    const loaded = current.current;
    if (!userId || identity.current !== userId || !validLeadId(id) || loaded.ownerId !== userId ||
        loaded.loading || loaded.error || loaded.leads.some(lead => lead.id === id) ||
        detailCache.current[id] || pendingDetails.current.has(id)) return;
    const request = generation.current;
    pendingDetails.current.set(id, request);
    storeDetail(id, { status: "loading" });
    try {
      const result = await reader.detail(id);
      if (request !== generation.current || identity.current !== userId) return;
      if (!result.ok) { await failRead(result); return; }
      storeDetail(id, result.lead ? { status: "loaded", lead: result.lead } : { status: "notFound" });
    } finally {
      if (pendingDetails.current.get(id) === request) pendingDetails.current.delete(id);
    }
  }, [userId, failRead]);

  // Also hide cached data synchronously on identity changes, before effects run.
  const visible = Boolean(userId && snapshot.ownerId === userId);
  const getLeadState = (id: string): LeadDetailState => {
    if (!validLeadId(id)) return { status: "notFound" };
    if (!visible || snapshot.loading) return { status: "loading" };
    if (snapshot.error) return { status: "error", message: snapshot.error };
    const lead = snapshot.leads.find(item => item.id === id);
    return lead ? { status: "loaded", lead } : details[id] || { status: "loading" };
  };
  return <Context.Provider value={{
    leads: visible ? snapshot.leads : [], total: visible ? snapshot.total : 0,
    loading: visible ? snapshot.loading : true, error: visible ? snapshot.error : "",
    refreshLeads, ensureLead, getLeadState,
  }}>{children}</Context.Provider>;
}

export function useLeads() {
  const context = useContext(Context);
  if (!context) throw new Error("Leads provider is missing");
  return context;
}
