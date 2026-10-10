# Phase 8: Appwrite queries, pagination, and totals

> Phase 10 handoff: follow [deployment readiness](deployment-readiness.md) and [final QA](final-qa.md) for current operational instructions and verification status. Dated results and earlier-phase scopes below are historical records; they do not establish live deployment or delivery.

Phase 6 temporarily loaded the latest 100 active rows and searched, filtered, paginated, and counted that batch in the browser. Phase 8 replaces that strategy with page-sized TablesDB queries and full matching-result totals. Phase 7 status updates, append-note history, and permanent deletions remain confirmed-only operations. Phase 9 subsequently hardened public submissions; this server query/pagination architecture remains unchanged.

## Architecture

LeadsList controls → central LeadsProvider query state → createLeadsReader → shared authenticated `tablesDB.listRows()` → requested matching page.

`lib/admin/lead-queries.ts` builds queries and validates criteria. The installed `appwrite@28.1.0` supports all operators and the object-argument `listRows` signature used here. List, dashboard, and direct-detail state are independent. Reads are lazy: visiting the list loads its page; visiting the dashboard loads its summary; opening a direct detail can call `getRow()` without a list request.

The query state contains page, trimmed applied search, status, service, and date range. The provider separately holds the immediate search draft and last successfully displayed query, so old rows are not labelled as completed results for new criteria.

## Exact list queries

```ts
const queries = [Query.isNull("deletedAt")];
if (status) queries.push(Query.equal("status", status));
if (service) queries.push(Query.equal("service", service));
if (search) queries.push(Query.or([
  Query.contains("name", search),
  Query.contains("email", search),
  Query.contains("phone", search),
  Query.contains("company", search),
]));
if (date) queries.push(
  Query.greaterThanEqual("$createdAt", startISO),
  Query.lessThan("$createdAt", endISO),
);
queries.push(
  Query.orderDesc("$createdAt"),
  Query.orderDesc("$id"),
  Query.limit(5),
  Query.offset((page - 1) * 5),
);
await tablesDB.listRows({
  databaseId: appwriteConfig.databaseId,
  tableId: appwriteConfig.leadsTableId,
  queries,
  total: true,
  ttl: 0,
});
```

The helper receives the shared client/config from the provider. Every normal list and recent-lead query excludes archived rows. Full rows pass through `mapLeadRow()`; required missing/malformed fields cause safe read failure. Optional/null company and notes still become empty strings. There is no latest-100 batch or client-side dataset search/filter/pagination fallback.

## Search and filters

Search trims outer whitespace and uses a single OR of substring queries across **name, email, phone, company**. Blank/whitespace search adds no OR query. Search input is bounded to 200 characters to keep nested query strings within the SDK's query-size limit. Case is preserved; the application does not lower-case stored values or claim case-insensitive server matching.

**Live case behavior is unverified.** The old browser search explicitly lower-cased both sides. Appwrite's `contains()` behavior must be checked using a stored `Ankit Singh` and searches `ankit`, `ANKIT`, `AnKiT`. If these differ, report that limitation; do not add normalized columns, change the Function, or invent a workaround in Phase 8.

Search queries apply after a **400 ms debounce**. Typing updates the draft immediately. Applying a changed debounced value resets page to 1 once. Re-renders do not reset pagination. Status/service/date filters apply immediately using the currently debounced search, even while a newer search draft is pending; the later debounce applies that draft with the latest filters.

Status is validated against New, Contacted, In Progress, Converted, Closed. All Status omits its query. Services reuse the safely exported `enquiryServices` constant (module evaluation makes no enquiry request): Web Development, Software Engineering, UI/UX Design, Cloud & Infrastructure, Product Modernization, Other. All Services omits its query. Invalid status/service/date values produce safe feedback without database access. No public enquiry behavior changed.

## India-local date bounds

All Time adds no date condition. Today covers the current Asia/Kolkata calendar day. Last 7 Days covers today plus the preceding six India-local dates.

The helper obtains the business calendar date through `Intl.DateTimeFormat` with `timeZone: "Asia/Kolkata"`. UTC calendar arithmetic manipulates that date, then `T00:00:00+05:30` converts local midnight to an absolute instant. Sending `.toISOString()` produces the inclusive lower and exclusive upper bounds. The browser's local timezone is not used to define business midnight.

For example, India-local 2026-10-10 midnight is `2026-10-09T18:30:00.000Z`. Dates are computed at request time, not hardcoded. Last 7 Days also ends at tomorrow's India-local midnight so future days are excluded.

## Pagination and authoritative totals

`LEADS_PAGE_SIZE = 5`; it is not user-configurable. Offset pagination preserves numbered pages: offset = `(page - 1) * 5`. Unsafe/non-integer/negative/zero pages normalize to 1 before querying.

`total` is Appwrite's matching active-result count, independent of page length. `totalPages = Math.ceil(total / 5)`. Zero results have zero result pages and internal page 1. Range labels use the displayed page metadata; paging is disabled during query updates, pending search, or writes.

Search, status, service, and date changes reset page 1. After each response, the provider clamps an out-of-range page to `min(page, max(1, totalPages))` and performs **at most one corrected fetch**. If the database changes again and that corrected page is also invalid, it shows a safe refresh state instead of looping. A deliberate refresh uses the latest corrected page and current criteria.

Offset pagination can become slower and shift under concurrent inserts/deletions on large or frequently changing datasets. Cursor pagination may be preferable there; this assessment keeps approved numbered pages.

The secondary `$id` order provides deterministic ties for equal creation timestamps. If an actual HTTP 400 explicitly identifies unsupported/invalid `$id` ordering, the reader retries once without that order and exposes a safe ordering notice. Missing-index errors, generic 400s, and authentication/permission failures do not trigger this fallback. The reader remembers that ordering fallback for its lifetime. It does not create an index or change schema. **Live ordering/index compatibility remains unverified.**

## Dashboard strategy

`lib/admin/dashboard.ts` centralizes six parallel requests, all with `total: true`, `ttl: 0`:

1. Active recent rows: `isNull("deletedAt")`, `orderDesc("$createdAt")`, `orderDesc("$id")`, `limit(5)`. Its total supplies Total Leads; its full rows supply Recent Leads.
2. One query for each of the five canonical statuses: `isNull("deletedAt")`, `equal("status", status)`, `limit(1)`, `select(["$id"])`. Only returned totals supply status counts.

Count-only rows bypass the full Lead mapper because required lead fields are deliberately excluded. The summary is not calculated from list rows or search/filter results. Each total is exact for its individual request; these six requests are not a transactionally frozen snapshot across concurrent database changes.

The pre-Phase-9 visual alignment removes Open Pipeline, its Review action, and the unused recent-open query/provider path. Dashboard Recent Leads now requests up to five newest active rows. Dashboard summaries remain cached in provider memory and do not refetch merely because components render. The five status-count queries and Leads page pagination are unchanged.

## Mutations, caches, and races

Status/notes retain narrow `updateRow` payloads and returned-row ID/mapping checks. Permanent deletion now uses `deleteRow` with configured database/table/row IDs, without a deletedAt write or fabricated returned row. Per-lead locks and simple append-only notes remain; no admin creation is introduced.

- Status success preserves the confirmed returned detail row; delete success removes list/detail/recent data and marks details unavailable, then refreshes the current server list and any requested dashboard state. Server totals/page correction are authoritative; no guessed filtered-count arithmetic is performed, including for detail-only rows.
- Notes additions update confirmed cached data and preserve the current page. They do not normally query the list or refresh dashboard statistics. If a list read was already pending or criteria changed during the write, that user-requested read is resumed after the lock settles.
- Reads that would conflict with pending writes are queued/coalesced until per-lead locks settle. Other leads remain independently operable.
- Separate list/dashboard request counters discard superseded responses. A shared identity/lifecycle epoch invalidates all pending results after logout, authorization loss, identity change, unmount, or a 401 cache clear. Detail reads have per-ID tokens/version guards. Unavailable/deleted cache entries cannot be resurrected by older list data.
- Confirmed write success and follow-up read failure are separate. A failed refresh does not report status/delete failure, restore a deleted row, or clear a notes draft as if a failed write succeeded.

Previous rows/figures remain during subsequent reads, with Updating feedback explicitly describing them as previous results. Initial reads use the existing full loading state. Empty unfiltered results say `No leads found.`; filtered/search empty results say `No leads match your search or filters.`

401 clears private page/detail/dashboard data and requests one controlled central auth recheck, without automatic read/write retry loops. 403 keeps the valid session and shows safe read-access feedback. Network/5xx/malformed responses show safe deliberate retry states. Raw SDK errors/responses are not displayed. No private data/auth/search state is persisted in browser storage.

## Indexes and manual Console work

**Required now:** verify the existing `status`, `service`, and `deletedAt` indexes are available in **Databases → configured database → leads → Indexes**. Existing Appwrite metadata indexes support `$createdAt` and `$id` ordering. No new mandatory index is identified for the implemented substring query strategy.

**Not required:** full-text indexes. `Query.search()` is not used. Do not create speculative composites or additional columns. Substring matching can scan candidates; ordinary key indexes do not make arbitrary substring matching equivalent to full-text lookup.

If live Appwrite reports a missing index, capture its exact query/index requirement for review and add only that proven requirement manually. No index/schema/permission changes are performed by this code or its tests.

Manually enable StackNova Admins **Read + Update + Delete**, with Create disabled, no public grants, and unchanged Row Security. No new environment variables are needed. Static export remains: browser SDK queries use the authenticated session/team/table security boundary. No middleware, SSR, API routes, route handlers, server actions, or dynamic detail routes are added.

References checked: [Appwrite queries](https://appwrite.io/docs/products/databases/tablesdb/queries), [tables/indexes](https://appwrite.io/docs/products/databases/tablesdb/tables), [pagination/totals](https://appwrite.io/docs/products/databases/tablesdb/pagination), and the installed SDK's Query, TablesDB, and RowList typings. [Official index query validator](https://github.com/utopia-php/database/blob/main/src/Database/Validator/IndexedQueries.php) distinguishes full-text search requirements from substring queries.

## Verification

Automated tests mock TablesDB/auth and never use a live database or send real enquiries/emails. Run `node --test tests/*.test.cjs` at the root, `npm.cmd test` from `functions/submit-enquiry/`, and `npm.cmd run build` at the root. Phase 6 mapper/detail/auth regression checks remain; obsolete batch/client-filter assertions now test paginated/server behavior. Status/notes/delete failures, locking, mapping, draft preservation, and auth invalidation are retained.

Verification on 2026-10-10: **244 tests passed** (202 root tests, including 63 Phase 8 tests, plus 42 Function/Resend tests). The final `npm.cmd run build` passed compilation, lint, type checks, and all eight static pages. All four exported admin routes retain guarded initial HTML, without unit fixture data.

A browser check of the exported build restored the signed-out state and redirected to Admin Login. No authenticated lead-query session or disposable mutation test lead was available, so live search case behavior, ordering/index compatibility, totals, and mutation reconciliation remain unverified. The temporary verification server/tab were closed.

If `npm.cmd run dev` was running during the build, restart that development server afterwards: the existing project configuration uses `dist` for both development artifacts and export output, and an already-running dev page can reference stale development assets after a build. The configuration itself is unchanged.

Live verification is pending. Use an authorized admin session and a specifically identified disposable test lead for mutations:

1. Confirm existing indexes/Read + Update + Delete team grants in the Console.
2. Use enough active leads for several five-row pages; verify requests carry limit/offset/total/ttl as documented.
3. Navigate forward, backward, and via page numbers; check range/total/page count.
4. Store/use `Ankit Singh`; compare `ankit`, `ANKIT`, `AnKiT` and report observed case behavior.
5. Search phone/email substrings and a company; verify optional/null company does not break reads.
6. Verify blank search omits the OR; clear search and combine search + status + service.
7. Check Today around India midnight and Last 7 Days across the inclusive start/exclusive end.
8. Verify no-match state and query-update feedback.
9. Change a disposable New lead to Contacted while filtered by New; confirm persisted detail and refreshed results/dashboard.
10. Permanently delete a disposable last matching lead on a final page; verify authoritative total/page correction and that its Appwrite row no longer exists.
11. Verify deleted and historically archived direct URLs are unavailable; append notes and confirm no extra count/page request.
12. Refresh the browser, inspect full dashboard totals and five recent leads, then log out and verify protection.
13. Record any actual ordering or missing-index errors. Do not claim compatibility from mocked tests alone.

The Contact → Function → TablesDB → Resend pipeline is unchanged. CAPTCHA, rate limiting, anti-spam, honeypots, and unrelated production hardening remain outside Phase 8.

## Hard-delete transition

Keep the deletedAt column/index, mapper support and all `Query.isNull("deletedAt")` filters temporarily. New deletions do not write deletedAt. Historical populated markers stay excluded until you manually inspect and decide which rows to delete permanently; never clear those markers to migrate them. Schema/filter cleanup is a separate approved task. A delete 404 removes stale caches and reconciles totals without a success notice. Confirmed deletion remains successful if subsequent reads fail. See [lead management](phase-7-lead-management.md) for permanent confirmation, errors and manual migration. Only frontend rebuild/redeployment and the team table Delete grant are required; neither Function changes.
