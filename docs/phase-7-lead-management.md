# Phase 7: lead management writes and permanent deletion

> Phase 10 handoff: follow [deployment readiness](deployment-readiness.md) and [final QA](final-qa.md) for current operational instructions and verification status. Dated results and earlier-phase scopes below are historical records; they do not establish live deployment or delivery.

Authorized StackNova admins can change status, append private notes, and permanently delete a lead. Every operation is confirmed by Appwrite before cached lead data changes. Public Contact submission, both Functions, Resend, Send Email/CC/BCC, authentication and Phase 8 queries are unchanged by the hard-delete update. Phase 9 subsequently hardened public submissions without changing these admin operations.

## Manual Appwrite permission step

In **Databases → configured database → leads → Security → StackNova Admins**, enable Delete alongside Read and Update:

| Permission | Grant |
| --- | --- |
| Read | Yes |
| Update | Yes |
| Create | No |
| Delete | Yes |

Do not grant Any, Guests, Users, or any public access. Keep Row Security, per-row grants and Function permissions/scopes unchanged. Public lead creation continues through submit-enquiry. Without the manual Delete grant, deletion fails safely and preserves the lead and valid admin session.

## Provider and SDK architecture

LeadDetails calls the central LeadsProvider methods:

- `updateLeadStatus(id, status)`
- `addLeadNote(id, newNote)`
- `deleteLead(id)`

`lib/admin/lead-mutations.ts` receives the shared authenticated TablesDB instance and configured IDs. Only status and notes use `updateRow()`; permanent deletion uses `deleteRow()` exclusively. No admin `createRow()` call exists. No full Lead, arbitrary patch, permissions, credentials or fabricated timestamp is sent.

The installed appwrite@28.1.0 object signature is:

```ts
deleteRow(params: {
  databaseId: string;
  tableId: string;
  rowId: string;
  transactionId?: string;
}): Promise<{}>;
```

The deletion call is:

```ts
await tablesDB.deleteRow({
  databaseId: appwriteConfig.databaseId,
  tableId: appwriteConfig.leadsTableId,
  rowId: id,
});
```

The helper validates ID/configuration, awaits SDK completion and returns `{ ok: true, id }`. It does not fabricate a returned lead. Status/notes success still maps the returned row, verifies ID and requested field, and uses real Appwrite timestamps.

Per-lead locks block duplicate or overlapping status/notes/delete requests. Other leads remain independently operable. Request counters, detail versions and identity/lifecycle checks prevent stale results after deletion, logout, identity change, provider unmount or auth cache clearing. Detail navigation/unmount also prevents a stale deletion completion from redirecting another page.

## Status updates

Only canonical statuses are accepted: New, Contacted, In Progress, Converted and Closed. The only update payload is `{ status: validatedStatus }`. After confirmed persistence, returned lead data updates the detail/list/recent caches; the current server list and requested dashboard reconcile authoritative totals. Failure preserves the confirmed status.

## Append-only notes

Notes remain one optional Text column. Existing history appears above an initially empty Add a note textarea. The provider trims the new draft, rejects whitespace-only input, and appends it to confirmed history using two newlines:

```ts
const newNote = draft.trim();
const existingNotes = confirmedLead.notes.trim();
const nextNotes = existingNotes ? `${existingNotes}\n\n${newNote}` : newNote;
// The only updateRow data:
{ notes: nextNotes }
```

Internal line breaks remain. Only confirmed success updates history and clears the draft. Failure preserves both. There are no separate note records, note metadata or individual history-edit controls. Notes remain escaped text.

Appwrite receives replacement Text rather than an atomic append. Locks prevent overlaps within this provider, not across admins/tabs; refresh confirmed history when needed. This existing behavior is unchanged.

## Permanent deletion and confirmation

The destructive **Delete Lead** button opens the existing modal. Its warning is:

> This will permanently delete this lead and cannot be undone.

Cancel is initially focused. Cancel/Escape close without a request and restore focus. Confirmation is explicit; pending controls are disabled and show **Deleting…**. Escape cannot dismiss the dialog while deletion is pending. There is no trash, recycle bin, restore or backup table.

Only after deleteRow confirms success does the provider remove the lead from list/detail/recent caches. A detail-unavailable marker protects against stale reads. It invalidates pending list/dashboard responses and refreshes the current server query and any requested dashboard. Server totals determine counts and page correction; no guessed subtraction occurs. If the list was not requested yet, the destination page loads it normally.

Confirmed success redirects to `/admin/leads/` and displays **Lead deleted successfully.** The notice is transient provider memory. A following list/dashboard refresh failure is a separate read failure: deletion remains successful and the deleted row is not restored.

## Safe errors

| Failure | Behavior |
| --- | --- |
| 401 | Clear private caches, invalidate pending results, and request the existing controlled central auth recheck. No retry loop. |
| 403 | Preserve the valid session and confirmed lead. Show safe failure; verify team Delete permission. |
| 404 | Treat the row as already unavailable. Remove stale list/detail/recent data and reconcile requested list/dashboard totals. Return false and do not show deleted-success feedback. |
| Network / 5xx | Preserve confirmed lead data; restore controls and allow manual retry. |
| Invalid status/notes returned row | Preserve confirmed data and show safe failure; no fabricated success. |

Deletion errors say **Unable to delete this lead right now.** Missing rows say **This lead is no longer available.** Raw Appwrite errors are hidden. Status/notes retain their existing safe messages. No private data is stored in localStorage/sessionStorage.

## Legacy deletedAt compatibility and manual migration

New deletions perform no deletedAt write. Keep the column, index, Lead field, mapper support, `Query.isNull("deletedAt")` list/dashboard filters, detail protection and Send Email Function guard temporarily. They prevent previously soft-deleted rows from reappearing. Null/unset active rows remain supported.

No historical row is automatically restored, cleared or migrated. Manually inspect populated deletedAt values in the correct database/table, identify intended historical deletions and permanently delete only rows you select. Do not clear deletion markers, which would reactivate archived leads. Verify remaining populated markers and active totals before considering cleanup.

After historical rows are handled, removing all filters/types/consumer guards and then the schema/index is a separate approved task. Do not drop the column while code still queries it. Permanently deleted rows naturally return getRow 404 and cannot be emailed; email code itself is unchanged.

## Queries, static export and deployment

Current Phase 8 server search/status/service/date queries, debounce, five-row pagination, ordering and race protection remain. Deleting the final item on an invalid page uses existing authoritative nearest-page correction. Dashboard Recent Leads stays five, all five status totals remain, and Open Pipeline stays removed.

Static export is unchanged: authenticated browser SDK calls require no Next.js server, route handlers, middleware, server actions or dynamic ID routes. Rebuild/redeploy only the frontend. Neither submit-enquiry nor send-lead-email requires modification or redeployment. No new environment variables, Function scopes or schema changes are needed.

## Automated and live verification

Run `node --test tests/*.test.cjs` at the root, `npm.cmd test` in each Function directory, and `npm.cmd run build` at the root. Tests mock Appwrite/Resend and never delete real leads or send email.

Live verification remains pending:

1. Enable the team Delete grant and rebuild/redeploy the frontend.
2. Open a specifically identified disposable test lead. Check permanent warning and cancel without deletion.
3. Confirm deletion once; verify pending state, redirect and deleted-success notice.
4. Confirm the actual row no longer exists in Appwrite and its direct URL is unavailable.
5. Verify loaded dashboard totals/recent rows and current list total reconcile; test final-page correction.
6. Temporarily remove only Delete permission, retain Read/Update, and verify safe failure without logout or cache removal. Restore Delete.
7. Verify status and successive notes still persist through updateRow, and Send Email/CC/BCC still work on an existing lead.
8. Verify historical populated deletedAt rows remain hidden; inspect/migrate them manually only as intended.

No Console permissions, historical data or live deletion were changed by automated verification.

Local verification on 2026-10-10: **475 tests passed** (313 root frontend/admin tests, 114 send-lead-email tests, and 48 submit-enquiry/Resend tests). The final `npm.cmd run build` passed compilation, lint, type checks and all eight static pages; `git diff --check` passed. One existing CC/BCC presentation assertion was aligned with the current panel's omitted placeholders; email code was not changed. Live permission/deletion verification remains pending.
