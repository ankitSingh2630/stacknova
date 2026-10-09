import { Query, type TablesDB } from "appwrite";
import { leadStatuses, type Lead, type LeadStatus } from "./types";

export const leadBatchLimit = 100;
export const leadsMessages = {
  failure: "Unable to load leads right now.",
  access: "Unable to access leads right now. Please contact your administrator or try again.",
  session: "Unable to load leads. Please check your session and try again.",
};
export type ReadFailure = { ok: false; kind: "session" | "access" | "failure"; message: string };
export type LeadDetailState =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "loaded"; lead: Lead };

export function validLeadId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

// One mapper for list and detail reads. Never fabricate required row data.
export function mapLeadRow(input: unknown): Lead {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid lead row");
  const row = input as Record<string, unknown>;
  if (!validLeadId(row.$id) || !timestamp(row.$createdAt) || !timestamp(row.$updatedAt) ||
      !leadStatuses.includes(row.status as LeadStatus)) throw new Error("Invalid lead metadata");
  for (const field of ["name", "email", "phone", "service", "message", "source"]) {
    if (typeof row[field] !== "string" || !row[field].trim()) throw new Error("Invalid lead field");
  }
  const optionalText = (field: string) => {
    const value = row[field];
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") throw new Error("Invalid optional lead field");
    return value;
  };
  const deletedAt = optionalText("deletedAt");
  if (deletedAt.trim() && !timestamp(deletedAt)) throw new Error("Invalid deletion timestamp");
  return {
    id: row.$id, createdAt: row.$createdAt, updatedAt: row.$updatedAt,
    name: row.name as string, email: row.email as string, phone: row.phone as string,
    company: optionalText("company"), service: row.service as string, message: row.message as string,
    source: row.source as string, status: row.status as LeadStatus, notes: optionalText("notes"),
    deletedAt: deletedAt.trim() ? deletedAt : null,
  };
}

function readFailure(error: unknown): ReadFailure {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === 401) return { ok: false, kind: "session", message: leadsMessages.session };
  if (code === 403) return { ok: false, kind: "access", message: leadsMessages.access };
  return { ok: false, kind: "failure", message: leadsMessages.failure };
}

export function newestLeads(leads: Lead[]) {
  return [...leads].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function leadStatistics(leads: Lead[]) {
  return { total: leads.length, ...Object.fromEntries(leadStatuses.map(status =>
    [status, leads.filter(lead => lead.status === status).length])) } as { total: number } & Record<LeadStatus, number>;
}
export function batchNotice(loaded: number, total: number) {
  return total > loaded ? `Showing latest ${loaded} of ${total} leads. Figures and filters apply to the loaded batch.` : "";
}

export function createLeadsReader({ tablesDB, config }: {
  tablesDB: Pick<TablesDB, "listRows" | "getRow">;
  config: { databaseId: string; leadsTableId: string };
}) {
  const configured = () => Boolean(config.databaseId.trim() && config.leadsTableId.trim());
  return {
    async list(): Promise<{ ok: true; leads: Lead[]; total: number } | ReadFailure> {
      if (!configured()) return readFailure(null);
      try {
        const result = await tablesDB.listRows({
          databaseId: config.databaseId, tableId: config.leadsTableId,
          queries: [Query.orderDesc("$createdAt"), Query.limit(leadBatchLimit), Query.isNull("deletedAt")],
        });
        if (!Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total < result.rows.length)
          throw new Error("Invalid list response");
        const leads = result.rows.map(mapLeadRow).filter(lead => lead.deletedAt === null);
        return { ok: true, leads: newestLeads(leads), total: result.total };
      } catch (error) { return readFailure(error); }
    },
    async detail(id: string): Promise<{ ok: true; lead: Lead | null } | ReadFailure> {
      if (!validLeadId(id)) return { ok: true, lead: null };
      if (!configured()) return readFailure(null);
      try {
        const row = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.leadsTableId, rowId: id });
        const lead = mapLeadRow(row);
        if (lead.id !== id) throw new Error("Unexpected row ID");
        return { ok: true, lead: lead.deletedAt === null ? lead : null };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === 404) return { ok: true, lead: null };
        return readFailure(error);
      }
    },
  };
}
