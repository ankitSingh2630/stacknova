# Appwrite frontend foundation — Phase 2, with Phase 3 enquiry integration

> Hard-delete update: Current admin permission requirements supersede the historical foundation below: on leads ? Security grant StackNova Admins Read, Update and Delete; keep Create disabled and grant no Any/Guests/Users access. deleteLead uses deleteRow and never writes deletedAt. Keep the deletedAt column/index and query guards temporarily for historical rows. Manually inspect populated markers and decide which rows to permanently delete; do not clear markers or drop schema. Public creation and both Functions are unchanged. Rebuild/redeploy only the frontend. See [lead management](phase-7-lead-management.md).

## Current Phase 9 security configuration

See [Phase 9 security hardening](phase-9-security-hardening.md) for the current request contract, validation/limits, safe errors/logging, CORS, rollout and intentionally excluded anti-abuse infrastructure. The older Phase 2/3 descriptions below are historical. Admin authentication, real queries, status/notes updates, hard delete and direct email/CC/BCC are now implemented.

Keep public submit-enquiry Execute access Any, scope rows.write, and Function-owned database/table targets. StackNova Admins table permissions are Read/Update/Delete with Create disabled; no public grants. Leave Row Security and row permissions unchanged. Empty row permissions do not remove table-level access. Authenticated send-lead-email remains team-only Execute with rows.read. Phase 9 adds no schema, indexes, scopes or permission changes; live Console settings and column capacities still require read-only verification.

Frontend configuration consists of the seven NEXT_PUBLIC_* identifiers in `.env.example`, including `NEXT_PUBLIC_APPWRITE_SEND_LEAD_EMAIL_FUNCTION_ID`. Privileged runtime credentials and RESEND_API_KEY belong only inside Functions. Root ignore rules protect real `.env`/`.env.*` files while retaining all `.env.example` files. Exact ALLOWED_ORIGINS and preflight are preserved; CORS is not authentication and direct clients can supply an approved Origin. Do not introduce wildcard CORS or public table write access.

## Phase 3 update

Public enquiries now use the `submit-enquiry` Appwrite Function. See [Phase 3 setup and deployment](phase-3-enquiry.md) for the complete instructions. `Contact.tsx` invokes its public HTTPS URL with `fetch`; it never imports the browser SDK or writes directly to TablesDB. The exported SDK services remain preparation for later phases, and admin screens still use mock data.

Set `NEXT_PUBLIC_ENQUIRY_FUNCTION_URL` in the site's local/build environment after deploying the Function, then restart development or rebuild `dist/`. An empty URL fails safely; it does not fall back to email or mock success. The Function uses server-side `DATABASE_ID`, `LEADS_TABLE_ID`, and `ALLOWED_ORIGINS`, plus Appwrite-injected runtime credentials with only `rows.write`. For current Phase 3 testing set `ALLOWED_ORIGINS=http://localhost:3000`; production origins and testing are deferred until deployment access is available. Existing public identifiers remain unchanged. No Resend or authentication is implemented.

The remaining sections describe the original Phase 2 foundation; the Phase 3 update above supersedes their statements about the unchanged Contact form and future Function implementation.

Phase 2 prepares the Appwrite Web SDK for later frontend integration. The Appwrite database and the `leads` table already exist in the Console. Internal admin notes are stored in the optional `notes` Text column on `leads`. This phase does not create tables, alter permissions, authenticate users, or perform database operations.

The admin screens continue to use `MockLeadsProvider` and `lib/admin/mock-data.ts`. The public website and `components/Contact.tsx` remain unchanged.

The Phase 1 mock UI keeps an in-memory note timeline with titles and timestamps for display. It does not use a separate Appwrite table. Keep that demo intact until real admin integration, when persistence will use the single `leads.notes` Text field.

## SDK and configuration

The project uses the `appwrite` Web SDK, currently installed at version `28.1.0`. Install the project's locked dependencies with `npm ci` when setting up another checkout.

- `lib/appwrite/config.ts` reads the six public environment variables into `appwriteConfig`.
- `lib/appwrite/client.ts` creates and exports one `Client`, one `Account`, and one `TablesDB` instance. Both services share the same client.
- No screen imports these modules yet. Initialization does not call any Appwrite API or subscribe to realtime events.

The integration uses the current `TablesDB` API for tables and rows.

## Environment variables

Keep the existing `.env.local` values local. Do not overwrite that file with the empty example. For a new checkout, use `.env.example` as the template and fill in values from your own Appwrite Console.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT` | Project API endpoint, including the `/v1` path. |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID` | Appwrite project ID. |
| `NEXT_PUBLIC_APPWRITE_DATABASE_ID` | Database containing the existing `leads` table. |
| `NEXT_PUBLIC_APPWRITE_LEADS_TABLE_ID` | ID of the `leads` table. |
| `NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID` | Team ID reserved for future administrator access. |
| `NEXT_PUBLIC_ENQUIRY_FUNCTION_URL` | Public HTTPS URL of the deployed `submit-enquiry` Function. |

Populate these variables before importing the client in a future phase. Configuration defaults to empty strings when a variable is missing; it does not invent a project or endpoint. The SDK requires a valid HTTP(S) endpoint when the client module is initialized.

All `NEXT_PUBLIC_` values are public frontend configuration and can be included in browser assets once used. Never put an Appwrite API key, session secret, password, or other privileged credential in these variables. Table IDs and team IDs do not grant access by themselves; Appwrite permissions enforce access.

Next.js replaces direct `NEXT_PUBLIC_` environment references during the build. Restart the development server after environment changes, and rebuild the static export before deploying changed configuration.

For future browser requests, register `localhost` and the production hostname as Web platforms in the Appwrite Console. Phase 2 does not make a connection or verify those platform settings.

## Database structure

### leads table

| Column | Purpose |
| --- | --- |
| `name` | Enquirer's name. |
| `email` | Contact email address. |
| `phone` | Contact phone number. |
| `company` | Company name. |
| `service` | Requested service. |
| `message` | Enquiry or project description. |
| `source` | Enquiry source. |
| `status` | Lead pipeline status. |
| `notes` | Optional Text column for internal admin notes; no index required. |
| `deletedAt` | Soft-deletion timestamp; empty for active leads. |

Supported status values:

- `New`
- `Contacted`
- `In Progress`
- `Converted`
- `Closed`

Use Appwrite's system metadata for `$id`, `$createdAt`, and `$updatedAt`. Do not add duplicate custom columns for these fields.

Current leads indexes:

- `status`
- `service`
- `deletedAt`

The public Contact form does not supply `notes`. The `submit-enquiry` Function creates leads with only `name`, `email`, `phone`, `company`, `service`, `message`, `source`, and `status: "New"`. It omits `notes` and `deletedAt`. Internal notes remain empty until an authenticated admin updates `leads.notes` in a later integration phase. No index is needed for `notes`.

## Security

The `leads` table remains private, including its internal notes. Do not grant public access at either table or row level:

- No public read.
- No public create.
- No public update.
- No public delete.
- Notes remain private.

Public enquiry creation goes through the `submit-enquiry` Appwrite Function using its execution-provided runtime key. Privileged credentials must never be put in frontend variables.

Admins will later authenticate using Appwrite Authentication. Future administrator access must be restricted to the designated admin team through Appwrite permissions. The exported `account` instance is only preparation; no login, session lookup, or team check is implemented in Phase 2.

## Static export and phase boundary

Keep `output: 'export'` in `next.config.mjs`. The Web SDK foundation does not require a Next.js server, API routes, server actions, or runtime SSR. There is no Appwrite request during this phase, including during the production build.

Build with:

```sh
npm run build
```

On Windows PowerShell, use `npm.cmd run build` if the execution policy blocks `npm.ps1`. The static website is emitted to `dist/`.

Stop after this foundation. Authentication, lead fetching, creation, updates, notes persistence, deletion, Appwrite Functions, and Resend are outside Phase 2.

## References

- [Appwrite Web SDK setup](https://appwrite.io/docs/quick-starts/web)
- [Appwrite TablesDB Web SDK reference](https://appwrite.io/docs/references/cloud/client-web/tablesDB)
- [Next.js 14 environment variables](https://nextjs.org/docs/14/app/building-your-application/configuring/environment-variables)
