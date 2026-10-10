import { Query, type TablesDB } from "appwrite";
import { enquiryServices } from "../enquiry";
import { calendarDate } from "./format";
import { leadStatuses, type LeadStatus } from "./types";

// enquiryServices is a constant; importing it does not submit a public enquiry.
export const leadServices = enquiryServices;
export const LEADS_PAGE_SIZE = 5;
export const SEARCH_DEBOUNCE_MS = 400;
export type LeadQuery = { page: number; search: string; status: "" | LeadStatus; service: string; date: "" | "today" | "week" };
export const initialLeadQuery: LeadQuery = { page: 1, search: "", status: "", service: "", date: "" };

export function normalizeLeadQuery(input: Partial<LeadQuery> = {}): LeadQuery {
  const query = { ...initialLeadQuery, ...input };
  if (typeof query.search !== "string" || query.search.length > 200 ||
      (query.status !== "" && !leadStatuses.includes(query.status)) ||
      (query.service !== "" && !leadServices.includes(query.service as typeof leadServices[number])) ||
      !["", "today", "week"].includes(query.date)) throw new Error("Invalid lead filters");
  return { ...query, search: query.search.trim(), page: Number.isSafeInteger(query.page) && query.page >= 1 &&
    query.page <= Math.floor(Number.MAX_SAFE_INTEGER / LEADS_PAGE_SIZE) ? query.page : 1 };
}

export function indiaDateBounds(range: "today" | "week", now = new Date()) {
  const today = calendarDate(now);
  // Calendar arithmetic uses UTC solely to manipulate a yyyy-mm-dd date.
  // The explicit +05:30 then converts India-local midnight to an absolute instant.
  const startDay = new Date(today + "T00:00:00Z");
  if (range === "week") startDay.setUTCDate(startDay.getUTCDate() - 6);
  const start = new Date(startDay.toISOString().slice(0, 10) + "T00:00:00+05:30");
  const end = new Date(new Date(today + "T00:00:00+05:30").getTime() + 24 * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export const newestFirstQueries = () => [Query.orderDesc("$createdAt"), Query.orderDesc("$id")];
export function buildLeadQueries(input: Partial<LeadQuery> = {}, now = new Date()) {
  const query = normalizeLeadQuery(input);
  const queries = [Query.isNull("deletedAt")];
  if (query.status) queries.push(Query.equal("status", query.status));
  if (query.service) queries.push(Query.equal("service", query.service));
  if (query.search) queries.push(Query.or(["name", "email", "phone", "company"].map(field => Query.contains(field, query.search))));
  if (query.date) {
    const bounds = indiaDateBounds(query.date, now);
    queries.push(Query.greaterThanEqual("$createdAt", bounds.startISO), Query.lessThan("$createdAt", bounds.endISO));
  }
  return [...queries, ...newestFirstQueries(), Query.limit(LEADS_PAGE_SIZE), Query.offset((query.page - 1) * LEADS_PAGE_SIZE)];
}
export const totalPages = (total: number) => Math.ceil(total / LEADS_PAGE_SIZE);
export const nearestPage = (page: number, total: number) => Math.min(page, Math.max(1, totalPages(total)));

// Retry only a specific unsupported ID-order error, never missing-index errors
// or generic validation/auth failures. This does not assume live compatibility.
export function createRowLister(tablesDB: Pick<TablesDB, "listRows">, config: { databaseId: string; leadsTableId: string }) {
  let idOrderSupported = true;
  const idOrder = Query.orderDesc("$id");
  return {
    get warning() { return idOrderSupported ? "" : "Results are ordered by creation date; secondary ID ordering is unavailable."; },
    async list(queries: string[]) {
      const send = (items: string[]) => tablesDB.listRows({ databaseId: config.databaseId, tableId: config.leadsTableId, queries: items, total: true, ttl: 0 });
      const selected = idOrderSupported ? queries : queries.filter(query => query !== idOrder);
      try { return await send(selected); }
      catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
        if (code !== 400 || !selected.includes(idOrder) || !/\$id|_uid/.test(message) || !/order|sort/i.test(message) ||
            !/unsupported|not supported|not allowed|cannot order|invalid order/i.test(message) || /index/i.test(message)) throw error;
        idOrderSupported = false;
        return send(selected.filter(query => query !== idOrder));
      }
    },
  };
}
