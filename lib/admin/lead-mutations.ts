import type { TablesDB } from "appwrite";
import { mapLeadRow, validLeadId } from "./leads";
import { leadStatuses, type Lead, type LeadStatus } from "./types";

export type LeadMutation = "status" | "notes" | "archive";
export type MutationState = { operation: LeadMutation | null; pending: boolean; message: string; success: boolean };
export const emptyMutation: MutationState = { operation: null, pending: false, message: "", success: false };
export const mutationMessages = {
  status: "Unable to update lead status right now.",
  notes: "Unable to save notes right now.",
  archive: "Unable to remove this lead right now.",
  unavailable: "This lead is no longer available.",
};
export type MutationResult =
  | { ok: true; lead: Lead }
  | { ok: false; kind: "validation" | "session" | "access" | "notFound" | "failure"; message: string };

// Only these three narrow patches can reach updateRow. Never accept a Lead or
// an arbitrary data object from a caller, and never modify row permissions.
export function createLeadMutations({ tablesDB, config, now = () => new Date() }: {
  tablesDB: Pick<TablesDB, "updateRow">;
  config: { databaseId: string; leadsTableId: string };
  now?: () => Date;
}) {
  const write = async (id: string, operation: LeadMutation, data: { status: LeadStatus } | { notes: string } | { deletedAt: string }): Promise<MutationResult> => {
    if (!validLeadId(id) || !config.databaseId.trim() || !config.leadsTableId.trim())
      return { ok: false, kind: "validation", message: mutationMessages[operation] };
    try {
      const row = await tablesDB.updateRow({
        databaseId: config.databaseId, tableId: config.leadsTableId, rowId: id, data,
      });
      const lead = mapLeadRow(row);
      if (lead.id !== id || ("status" in data && lead.status !== data.status) ||
          ("notes" in data && lead.notes !== data.notes) || ("deletedAt" in data && !lead.deletedAt))
        throw new Error("Mutation was not confirmed by the returned row");
      return { ok: true, lead };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const kind = code === 401 ? "session" : code === 403 ? "access" : code === 404 ? "notFound" : "failure";
      return { ok: false, kind, message: kind === "notFound" ? mutationMessages.unavailable : mutationMessages[operation] };
    }
  };
  return {
    async status(id: string, value: unknown): Promise<MutationResult> {
      if (typeof value !== "string" || !leadStatuses.includes(value as LeadStatus))
        return { ok: false, kind: "validation", message: "Please select a valid lead status." };
      return write(id, "status", { status: value as LeadStatus });
    },
    async notes(id: string, value: unknown): Promise<MutationResult> {
      if (typeof value !== "string") return { ok: false, kind: "validation", message: mutationMessages.notes };
      if (!value.trim()) return { ok: false, kind: "validation", message: "Please enter a note before saving." };
      return write(id, "notes", { notes: value.trim() });
    },
    async archive(id: string): Promise<MutationResult> {
      return write(id, "archive", { deletedAt: now().toISOString() });
    },
  };
}
