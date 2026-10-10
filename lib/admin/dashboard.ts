import { Query, type TablesDB } from "appwrite";
import { createRowLister, newestFirstQueries } from "./lead-queries";
import { mapLeadRow, readFailure, validateRowList, type ReadFailure } from "./leads";
import { leadStatuses, type Lead, type LeadStatus } from "./types";

export type DashboardSummary = { total: number; counts: Record<LeadStatus, number>; recent: Lead[]; warning: string };
export function createDashboardReader({ tablesDB, config }: {
  tablesDB: Pick<TablesDB, "listRows">; config: { databaseId: string; leadsTableId: string };
}) {
  const lister = createRowLister(tablesDB, config);
  const configured = () => Boolean(config.databaseId.trim() && config.leadsTableId.trim());
  const recentQueries = () => [Query.isNull("deletedAt"), ...newestFirstQueries(), Query.limit(3)];
  return {
    async summary(): Promise<{ ok: true; summary: DashboardSummary } | ReadFailure> {
      if (!configured()) return readFailure(null);
      try {
        const results = await Promise.allSettled([
          lister.list(recentQueries()),
          ...leadStatuses.map(status => lister.list([Query.isNull("deletedAt"), Query.equal("status", status), Query.limit(1), Query.select(["$id"])])),
        ]);
        // Give session failure priority if several parallel queries fail.
        const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failures.length) return failures.map(result => readFailure(result.reason)).find(result => result.kind === "session") || readFailure(failures[0].reason);
        const values = results.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof lister.list>>>).value);
        validateRowList(values[0], 3);
        const recent = values[0].rows.map(mapLeadRow).filter(lead => lead.deletedAt === null);
        // Count-only selections intentionally bypass the full Lead mapper.
        const counts = Object.fromEntries(leadStatuses.map((status, index) => {
          validateRowList(values[index + 1], 1);
          return [status, values[index + 1].total];
        })) as Record<LeadStatus, number>;
        return { ok: true, summary: { total: values[0].total, counts, recent, warning: lister.warning } };
      } catch (error) { return readFailure(error); }
    },
    async open(): Promise<{ ok: true; leads: Lead[]; total: number } | ReadFailure> {
      if (!configured()) return readFailure(null);
      try {
        const result = await lister.list([Query.isNull("deletedAt"), Query.equal("status", ["New", "Contacted", "In Progress"]), ...newestFirstQueries(), Query.limit(3)]);
        validateRowList(result, 3);
        return { ok: true, leads: result.rows.map(mapLeadRow).filter(lead => lead.deletedAt === null), total: result.total };
      } catch (error) { return readFailure(error); }
    },
  };
}
