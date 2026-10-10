# Phase 6: real, read-only admin leads

> Hard-delete update: Current integration supersedes this historical read-only phase: status and notes use updateRow, and deleteLead permanently removes rows using deleteRow. StackNova Admins now requires table Read + Update + Delete (Create disabled). The deletedAt mapper, active filters and detail guards remain temporarily for historical archived rows; no markers are cleared or schema removed. See [Phase 7](phase-7-lead-management.md) and [Phase 8](phase-8-query-pagination.md) for current behavior.

Phase 6 connects the authenticated admin workspace to the existing private Appwrite `leads` table. Contact, `lib/enquiry.ts`, the `submit-enquiry` Function, Resend, public submission behavior, and Function scopes are unchanged. No lead writes or admin write permissions are added.

## Architecture and security boundary

The existing shared Appwrite Web SDK (`appwrite@28.1.0`) Client and TablesDB instance are reused:

```text
Authenticated StackNova admin
→ AdminGuard
→ LeadsProvider
→ authenticated Appwrite browser session
→ TablesDB
→ private leads table
→ Dashboard / Leads List / Lead Details
```

**AdminGuard = UI protection. Appwrite Team Read permission = real data protection.** The browser guard cannot secure a database on its own. Appwrite must enforce the table-level Read grant for the configured StackNova Admins team on every request.

`LeadsProvider` is the source of truth for the active batch, returned total, loading/error state, refresh/retry, and a separate detail cache. It mounts inside `AdminGuard` and additionally gates every read on an authorized identity. It does not request data while auth is loading, signed out, forbidden, or in an error state. Private caches are hidden immediately on identity changes; stale or unmounted requests cannot repopulate them.

`lib/admin/leads.ts` contains the single row mapper and testable read helpers. Pages do not make independent SDK calls or use the public enquiry Function for reads. `MockLeadsProvider.tsx` and `mock-data.ts` were removed only after runtime/test import searches found no remaining consumers. No production mock fallback remains. Historical phase documentation still describes those earlier implementations; test data is now artificial, local to the tests.

## Exact read operations

Batch read:

```ts
tablesDB.listRows({
  databaseId: appwriteConfig.databaseId,
  tableId: appwriteConfig.leadsTableId,
  queries: [
    Query.orderDesc("$createdAt"),
    Query.limit(100),
    Query.isNull("deletedAt"),
  ],
})
```

These methods and object arguments are supported by the installed SDK. The explicit limit avoids Appwrite's implicit default page size. `deletedAt` is optional and omitted by the public Function; `Query.isNull` selects the active, unset/null representation. No guessed empty-string datetime query, extra count queries, new indexes, or server search/filter/pagination are added.

Direct detail read, when a valid runtime ID is not in the loaded batch/cache:

```ts
tablesDB.getRow({
  databaseId: appwriteConfig.databaseId,
  tableId: appwriteConfig.leadsTableId,
  rowId: id,
})
```

The provider preserves `listRows().total` as `total`. When it exceeds the loaded count, dashboard/list show a subtle notice such as:

> Showing latest 100 of 137 leads. Figures and filters apply to the loaded batch.

The dashboard's Total tile and all status figures count **loaded active leads**, not full-database totals. The returned total is used for the limitation notice. No notice is needed when the entire active result set fits in the batch.

## Row mapping

One canonical `Lead` type contains:

```text
id, name, email, phone, company, service, message, source,
status, notes, deletedAt, createdAt, updatedAt
```

- `$id` maps to `id`.
- `$createdAt` maps to `createdAt`; `$updatedAt` maps to `updatedAt`.
- Required text, metadata/ID, timestamps, and supported status are validated; missing required fields are not fabricated.
- Company and notes default to `""` when omitted/null.
- DeletedAt defaults to `null` when omitted/null/blank; valid populated timestamps are preserved and excluded from active display.
- Invalid row/response data results in safe read failure, rather than partially fabricated leads.
- Notes remain plain Text. No note timeline, note-specific timestamps, priority flag, duplicate metadata columns, or separate notes table is invented.
- Message/notes are rendered as React text, preserving multiline display and escaping HTML automatically.

Statuses remain exactly New, Contacted, In Progress, Converted, and Closed. Raw ISO timestamps are retained and formatted only for display. Date filters use the current India calendar date and last seven calendar days, replacing the old fixed October fixture dates.

## Screen behavior and temporary batch limit

The existing design is retained, with loading (`Loading leads…`), safe error/retry (`Try again`), and empty states (`No leads found`). Dashboard and list expose **Refresh leads**.

Dashboard statistics derive from the loaded active batch; recent leads are newest first. The former mock-only priority area now summarizes open leads (excluding Converted/Closed), because the real schema has no priority field.

The list retains desktop rows, mobile cards, search by name/email/phone/company, status/service/date filters, and five-row client pagination. Service options derive from real loaded data. **All filtering and pagination apply only to the latest batch of up to 100 active leads.** Searching cannot locate older rows outside that batch. Phase 8 will replace this temporary approach with Appwrite query-driven search/filter/pagination and appropriate aggregate behavior.

Detail URLs remain `/admin/lead/?id=<row-id>`. The existing Suspense boundary is preserved. Missing/invalid IDs are not sent to Appwrite. A loaded/cached lead is reused; otherwise the provider retrieves the individual row. Pending requests are deduplicated, and detail-only rows do not inflate batch counts. This supports direct refresh even for IDs outside the latest 100. Missing, unknown, soft-deleted, and inaccessible rows receive safe unavailable/error states.

Phase 6 is strictly **read-only**. Status select, note input/button, and delete button are disabled and explained as unavailable. Existing notes remain readable. Their old local mutation handlers, fake success feedback, and delete dialog were removed. Copy-email and contact links remain available. Phase 7 will add real status/notes/soft-delete persistence and the necessary write permissions; none are implemented here.

## Authentication versus read-access errors

| Read result | Behavior |
| --- | --- |
| 401/session failure | Immediately clear list, total, and detail cache; invalidate other pending reads; request one controlled central session recheck. Fail closed while data is unavailable. |
| Auth recheck confirms signed out/forbidden | Existing auth guard redirects or denies access. No duplicate Account/Teams logic is added to the leads provider. |
| Auth recheck still confirms authorized | Keep the leads error state. Do not automatically repeat the denied database read or remount the provider into a retry loop. |
| 403/read access denied | Clear private caches and show safe read-access/retry feedback. Do not log out the authorized account or trigger an auth recheck; the table Team Read grant may simply be missing. |
| Network/server/configuration/malformed-data failure | Show safe error state, without raw SDK messages, configuration IDs, or fake leads. |
| Manual retry/refresh | Clear caches, start a fresh batch read, and permit one controlled session recheck if that explicit attempt returns 401. |

The auth provider's `recheckSession` retains an already-authorized workspace during verification instead of setting a loading state that would repeatedly unmount/remount its data provider. The leads cache is already cleared before it is called. Concurrent central rechecks are suppressed. Neither 401 nor 403 starts automatic read retry.

## Manual Appwrite Console permission setup

Perform this yourself in the **existing StackNova project** before live read verification:

1. Open **Databases → existing database → leads → Settings → Permissions**.
2. Add/select the **StackNova Admins team** whose ID matches the existing `NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID` configuration.
3. Grant **Read only** to that team. Conceptually this is:

   ```ts
   Permission.read(Role.team(adminTeamId))
   ```

4. Leave the team's **Create, Update, and Delete unchecked**.
5. Do not add Any, Guests, or Users. Verify there are no unintended broad table Read grants or public Create grants.
6. Save the table permissions. No frontend rebuild is needed for a permission-only change. If you change public endpoint/project/database/table/team configuration, restart development and rebuild the static application yourself, preserving existing local values.

**Do not change Row Security, depend on per-row permissions, or migrate row permissions for this phase.** The Function currently creates rows with `permissions: []`. Table-level team Read applies to every row, and table/row access is granted at either level rather than requiring both. That model is compatible with the existing rows and needs no row grant. The actual live Row Security toggle was not inspected or changed by this implementation. See [Appwrite table and row permissions](https://appwrite.io/docs/products/databases/tablesdb/permissions).

The public Contact form still creates leads through the Function's unchanged `rows.write` runtime scope. The admin team needs no table Create permission, and no server API key or new backend is required. No Console permissions were changed automatically.

## Static export and automated tests

The project remains Next.js App Router with `output: 'export'`. All private reads occur client-side after authorization. The build does not fetch real leads, and static initial HTML contains session-checking/loading states. No SSR runtime, middleware, API routes, route handlers, server actions, or dynamic `[id]` route is added.

Run from the repository root:

```powershell
node --test tests/admin-leads.test.cjs tests/admin-leads-ui.test.cjs tests/admin-auth.test.cjs tests/admin-auth-ui.test.cjs tests/enquiry.test.cjs tests/contact.test.cjs
npm.cmd --prefix functions/submit-enquiry test
npm.cmd run build
```

TablesDB, Account, Teams, and email operations are stubbed/intercepted in automated tests. Tests do not depend on the live database. Coverage includes mapping/optional values, total preservation, exact queries, safe failures, loading/empty/retry, batch statistics, list filters/pagination/mobile markup, outside-batch/direct detail IDs, deleted rows, disabled mutations, zero database writes, no runtime mocks, authorization gates, stale reads, and 401/403 coordination without retry loops. Existing auth and public enquiry/Resend regression tests continue to run.

Implementation verification on 2026-10-09: **43 Phase 6 tests, 40 auth tests, nine enquiry/Contact tests, and 42 Function/Resend tests passed (134 total)**. The final static build passed lint/type checks and generated all eight pages. All four admin route HTML files begin with the session-checking state. Dashboard, desktop table, mobile cards, and read-only details were reviewed with isolated artificial data; mobile previews had no horizontal overflow. A scan of 26 browser JavaScript bundles found no old mock lead module/fixture markers and no server email configuration references. Runtime source scans found zero admin update/delete calls. The build regenerated `dist/`; these checks do not establish live Appwrite lead access.

## Manual live verification — still pending

After granting team Read:

1. Sign in as an accepted StackNova admin and open `/admin/`.
2. Confirm dashboard figures reflect real loaded leads, and the batch notice appears if active total exceeds 100.
3. Open `/admin/leads/`; verify real submitted enquiries appear and fictional Phase 1 leads are absent.
4. Search/filter a loaded real lead and exercise pagination/mobile cards.
5. Open a real detail link and refresh it. Also test a known row ID outside the latest batch.
6. Confirm message, optional company, plain-text notes, created/updated dates, and disabled mutation controls.
7. Check missing/unknown/deleted IDs show safe states.
8. Logout and attempt `/admin/leads/` signed out; verify login redirection and no private data display.
9. Using a test user, verify Appwrite denies real lead reads without accepted team membership. Remove the test user's membership, verify UI and backend denial, then restore membership afterward.
10. Confirm the public Contact → Function → private lead creation → Resend pipeline still works.

**Live real-lead access has not been verified by these tests or the build.** Your prior live Phase 5 authentication verification does not prove the Phase 6 table Read grant is configured. Live read/security verification remains pending your Console setup and manual testing. No live leads were fetched during implementation testing.

Stop after Phase 6. Phase 7 writes and Phase 8 optimized querying are excluded.
