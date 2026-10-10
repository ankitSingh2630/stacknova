# Phase 7: real lead management writes

Phase 7 enables authorized StackNova admins to change status, save internal notes, and archive leads. Appwrite persistence must succeed before confirmed provider data or success feedback changes. Lead creation continues through the existing Contact → submit-enquiry Function → TablesDB → Resend flow, which is unchanged.

## Manual Appwrite Console permission step

Open **leads → Settings → Permissions → StackNova Admins** and change the table grant from **Read** to **Read + Update**:

| Permission | Grant |
| --- | --- |
| Read | Yes |
| Update | Yes |
| Create | No |
| Delete | No |

Do not grant Any, Guests, Users, or other public access. Do not change Row Security, migrate per-row permissions, or change public Function permissions/scopes. Existing Function-created rows with `permissions: []` continue to use table-level team permissions.

Appwrite Update permission authorizes row updates; it does not restrict updates to particular fields. The application deliberately constructs only the three single-field patches below. These patches constrain application behavior; the Appwrite team grant remains the real data-security boundary. AdminGuard protects the UI, and accepted team membership protects access to the workspace.

## Provider and SDK architecture

`LeadDetails` calls only these methods from the central `LeadsProvider`:

- `updateLeadStatus(id, status)`
- `addLeadNote(id, newNote)`
- `softDeleteLead(id)`

`lib/admin/lead-mutations.ts` owns the shared `tablesDB.updateRow()` call. It uses the object-argument signature supported by the installed `appwrite@28.1.0`:

```ts
await tablesDB.updateRow({
  databaseId: appwriteConfig.databaseId,
  tableId: appwriteConfig.leadsTableId,
  rowId: id,
  data,
});
```

The helper receives the shared client and configured IDs from the provider. It never sends the full Lead object, permissions, metadata, unrelated fields, or credentials. Admin runtime has no `createRow()` or `deleteRow()` calls.

Every successful SDK response passes through the existing `mapLeadRow()`. The helper verifies that the returned ID matches the requested ID and that the requested field is confirmed. Appwrite's `$updatedAt` becomes `updatedAt`; no update timestamp is fabricated. A malformed, mismatched, or unconfirmed response produces safe failure feedback without changing confirmed caches. If a response cannot be confirmed after a request, refresh to inspect the database before trying again.

The provider returns `true` only after confirming the mutation and applying its returned row. Operation-specific pending, success, and failure state is held per lead. A lock immediately blocks duplicate or overlapping writes for the same lead, including status/notes/archive combinations. Other leads can be saved independently.

Batch refresh is disabled while any write is pending. Writes are blocked while a batch read is loading. A detail must be loaded before it can be edited, and cached details are not fetched again during a mutation. This prevents older list/detail reads from overwriting confirmed writes. Existing request-generation and identity checks also invalidate responses after unmount, logout, authorization loss, identity change, or a failed read that clears private caches.

## Status update

The selector saves on selection and shows a saving indicator. All mutation controls for that lead are disabled until the request settles. Validation happens before network access against these canonical values:

```text
New
Contacted
In Progress
Converted
Closed
```

The only payload is:

```ts
{ status: validatedStatus }
```

Invalid input causes zero SDK calls and shows `Please select a valid lead status.`. After confirmation, the returned mapped row replaces the cached lead. Dashboard counts and client-side filtered lists immediately derive from that confirmed state. A failed request preserves the previously confirmed status.

## Add a note / simple note history

Notes remain one optional Text column on `leads`. Persisted notes are displayed above an initially empty **Add a note** textarea and **Save Note** button. The input contains only the new note; it never preloads historic text. The provider constructs the append value from its currently confirmed cached lead, under the existing per-lead lock:

```ts
const newNote = draft.trim();
// Reject an empty newNote locally, with no network request.
const existingNotes = confirmedLead.notes.trim();
const nextNotes = existingNotes ? `${existingNotes}\n\n${newNote}` : newNote;

// The only updateRow data:
{ notes: nextNotes }
```

The first note saves normally; successive notes preserve previous text and use exactly two newlines between entries. Outer whitespace is trimmed and internal multiline content is preserved. No optimistic append occurs. The returned row is mapped and confirmed before provider history changes, and the textarea clears only when the provider reports success. Failed saves keep both persisted history and the typed draft unchanged, with safe failure feedback and retry controls.

Empty/whitespace drafts cannot submit and cannot clear notes. This UI provides a simple append-only text history, with no editing/deleting individual historic notes. There are no note IDs, authors, timestamps, arrays, JSON/schema changes, or separate `lead_notes` table. Notes are rendered as text, not HTML.

**Concurrency limitation:** Appwrite receives one replacement Text value, not an atomic append. Two admins saving from the same or stale cached history can theoretically overwrite one another's additions. Per-lead locking prevents duplicates/overlaps within this provider instance, not across admins or tabs. This simple approach is accepted for the assessment; no new table or concurrency protocol is introduced. Refresh to obtain the latest history before adding a note when needed.

## Archive / soft delete

The confirmation dialog explains that archiving removes the lead from active leads while retaining the stored row. Only confirmation starts the write. The sole payload is:

```ts
{ deletedAt: new Date().toISOString() }
```

**Soft delete = update `deletedAt`. It is not permanent deletion.** No hard-delete API or Delete permission is used.

After the returned row is mapped and confirms a populated `deletedAt`, the provider removes it from the active batch and marks its detail unavailable. Dashboard counts, list filters, and pagination derive from the remaining batch. Further mutation attempts for that cached archived lead are blocked. The detail page redirects to `/admin/leads/` after confirmed success. A transient success message lives in provider memory; no localStorage/sessionStorage is used.

The provider decrements the active total only if the row was in the current active list batch, with a floor of zero. Archiving a detail-only row fetched independently leaves the list total unchanged until an explicit refresh retrieves the latest server total. No additional count queries or automatic batch refill are added. If the batch becomes empty while the total remains positive, the dashboard prompts a refresh rather than implying that the database has no leads.

The Phase 6 list query remains exactly:

```ts
[
  Query.orderDesc("$createdAt"),
  Query.limit(100),
  Query.isNull("deletedAt"),
]
```

Direct detail refresh still uses `getRow()` for IDs outside the batch and excludes rows with a populated `deletedAt`. `/admin/lead/?id=<row-id>` is preserved.

## Safe failures and authorization

| Failure | Behavior |
| --- | --- |
| 401 | Clear private list/detail data, invalidate pending responses, and request one controlled central auth recheck. No automatic write/read retry loop. |
| 403 | Keep the authenticated admin session and confirmed data. Show operation-specific safe feedback; do not log out or recheck repeatedly. Verify the manual team Update grant. |
| 404 | Remove the stale lead from active caches and show an unavailable detail. Prevent further edits. Apply the same batch-only total adjustment. |
| Network / 5xx | Preserve confirmed data and notes draft, restore controls, and allow a deliberate retry. |
| Invalid/mismatched returned row | Preserve confirmed data and show safe feedback. No success is fabricated. |

Safe operation messages are:

- `Unable to update lead status right now.`
- `Unable to save notes right now.`
- `Unable to remove this lead right now.`
- For unavailable leads: `This lead is no longer available.`

Raw Appwrite errors, provider responses, credentials, and environment values are never displayed. No secrets or auth state are persisted in browser storage.

## Static export and Phase 8 boundary

The existing Next.js App Router `output: "export"` architecture remains. Writes run in client components through the authenticated Appwrite Web SDK. No middleware, SSR, API routes, route handlers, server actions, or dynamic ID routes are introduced.

Phase 6 latest-100 reads and client-side search, status/service/date filters, mobile cards, and pagination remain. Dashboard figures describe the loaded batch when the returned total exceeds it. Phase 8 server-side querying, cursor pagination, advanced queries, new indexes, bulk actions, and hard delete are not implemented.

## Automated verification

Tests stub TablesDB and auth. They do not contact live Appwrite. Phase 7 tests cover narrow patches, status validation, successive note appends, two-newline separators, multiline preservation, rejected empty notes, separate history/input, clearing the draft only after success, mapped returned rows/IDs/timestamps, confirmed-only updates, failures, per-lead locks, independent leads, cache removal/totals, read/write races, auth invalidation, UI saving/confirmation/redirect behavior, and zero admin create/hard-delete calls.

Run the root regression suites:

```powershell
node --test tests/admin-lead-mutations.test.cjs tests/admin-lead-mutations-ui.test.cjs tests/admin-leads.test.cjs tests/admin-leads-ui.test.cjs tests/admin-auth.test.cjs tests/admin-auth-ui.test.cjs tests/enquiry.test.cjs tests/contact.test.cjs
```

From `functions/submit-enquiry/`, run `npm.cmd test`. From the repository root, run `npm.cmd run build` to verify lint, types, and static export. Automated success does not prove live mutation permission or persistence.

Verification after the notes UX correction on 2026-10-09: **188 tests passed** (54 Phase 7, 43 Phase 6 reads/UI, 40 admin auth, 9 Contact/enquiry, and 42 Function/Resend). `npm.cmd run build` passed compilation, lint, type checks, and all eight static pages. No live Appwrite requests were made during this correction.

## Manual live verification checklist

Live Phase 7 verification is pending until you grant the table team Update permission and perform these checks:

1. Log in as an authorized StackNova admin.
2. Open a real lead.
3. Change status from New to Contacted.
4. Refresh the detail page.
5. Verify Contacted persisted.
6. Verify the dashboard and list reflect the status change.
7. Add an internal note with multiline text.
8. Refresh the detail page.
9. Verify the history persisted and the Add a note textarea is empty.
10. Add another note, then refresh.
11. Verify both notes remain separated by two newlines; blank/whitespace input cannot save or clear history.
12. Archive a test lead through the confirmation dialog.
13. Verify it disappears from the active list.
14. Verify loaded-batch dashboard counts change.
15. Verify its direct detail URL no longer displays an active lead.
16. Check that its Appwrite row still exists.
17. Verify `deletedAt` contains an ISO timestamp.
18. Verify no hard deletion occurred.
19. Temporarily remove only the team's Update grant, keeping Read.
20. Verify writes fail safely without logout or changes to confirmed data; notes drafts remain visible.
21. Restore the team's Update grant.

The public Contact/Function/Resend pipeline and its permissions require no Phase 7 changes.
