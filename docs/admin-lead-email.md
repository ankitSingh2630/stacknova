# Admin email from Lead Details

> Phase 10 handoff: follow [deployment readiness](deployment-readiness.md) and [final QA](final-qa.md) for current operational instructions and verification status. Dated results and earlier-phase scopes below are historical records; they do not establish live deployment or delivery.

> Hard-delete update: Lead management now permanently deletes rows through the authenticated browser SDK. A deleted lead naturally fails the existing getRow lookup and cannot be emailed. Legacy deletedAt guards remain for historical archived rows. Send Email, CC/BCC, templates, Resend, Function permissions and both deployed Functions are unchanged by this update; no Function redeployment is required for hard deletion. Only the frontend rebuild/redeployment and table team Delete grant are needed.

This focused feature adds Send Email below Private Notes on `/admin/lead/?id=<lead-id>`. Email history and database mutations are outside this feature.

## Architecture and authorization

`LeadEmailPanel` → `lib/admin/lead-email.ts` → shared authenticated Web SDK `functions.createExecution()` → private `send-lead-email` Function → server SDK `TablesDB.getRow()` → Resend → confirmed response.

`submit-enquiry` remains public for Contact submissions. It is not reused for admin sends: letting a public submission endpoint perform admin sends would mix incompatible authorization boundaries. The historical email-consistency update changed its customer/admin-notification templates and required separate deployment of both Functions at that time. Phase 10 changes no Function runtime and requires no Function redeployment.

Appwrite Execute access is the primary authorization boundary. Set it to the existing **StackNova Admins team only**, identified by the same team ID used by `NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID`. The permission role is `team:<team-id>` (`Role.team(teamId)`); do not grant Any, Guests, or all Users. The browser uses its existing Appwrite session and never submits passwords, tokens, API keys, or identity headers. The handler additionally requires Appwrite's runtime `x-appwrite-user-id` context and accepts only POST JSON. This does not substitute for the Console Execute permission. Console/API-key invocations without authenticated user context are intentionally rejected; use the signed-in admin page for live verification. Leave events and schedules empty. Normal admin usage never invokes a generated/custom Function domain.

The frontend exports one `Functions(client)` instance alongside Account, TablesDB, and Teams. It uses installed `appwrite@28.1.0`'s inspected object signature:

```ts
await functions.createExecution({
  functionId: appwriteConfig.sendLeadEmailFunctionId,
  body: JSON.stringify({ leadId, subject, message, ...(cc.length ? { cc } : {}), ...(bcc.length ? { bcc } : {}) }),
  async: false,
  xpath: "/",
  method: ExecutionMethod.POST,
  headers: { "content-type": "application/json" },
});
```

`xpath` is the Web SDK parameter name and is mapped by the SDK to the API's `path`. Synchronous execution is necessary to receive the Function response. Success requires `status === "completed"`, `responseStatusCode === 200`, valid JSON in `responseBody`, and `success === true`. An execution object alone is not proof of success.

## Request, validation, and lead read

The body has these required fields plus optional normalized CC/BCC arrays:

```json
{
  "leadId": "<opened-lead-id>",
  "subject": "Project quotation follow-up",
  "message": "Hi, we reviewed your requirements.\n\nLet us discuss the next steps.",
  "cc": ["manager@example.com"],
  "bcc": ["archive@example.com"]
}
```

The frontend cannot select or edit the primary To recipient. It may supply only the optional CC/BCC arrays in addition to leadId, subject, and message. The Function rejects other fields, including `to` and `recipientEmail`, malformed/non-object JSON, and bodies larger than 64 KiB.

Both frontend and Function require:

| Field | Validation |
| --- | --- |
| leadId | 1–36 characters; first alphanumeric; remaining alphanumeric, dot, underscore, or hyphen. |
| subject | Required string; trim outer whitespace; maximum 200 characters; reject line breaks/control characters. |
| message | Required string; trim outer whitespace; maximum 10,000 characters; preserve internal line breaks/tabs; reject unsafe controls. |

Length limits use JavaScript string length. Subject controls and unsafe message controls are checked against the original input so outer trimming cannot conceal them. Whitespace-only values fail. Frontend validation provides field feedback; backend validation remains authoritative.

The Function uses pinned `node-appwrite@29.1.0`:

```js
const client = new Client()
  .setEndpoint(env.APPWRITE_FUNCTION_API_ENDPOINT)
  .setProject(env.APPWRITE_FUNCTION_PROJECT_ID)
  .setKey(req.headers["x-appwrite-key"]);

const lead = await new TablesDB(client).getRow({
  databaseId: env.DATABASE_ID,
  tableId: env.LEADS_TABLE_ID,
  rowId: leadId,
});
```

Grant only **`rows.read`** to the Function's ephemeral key. This scope is a project-level row-read capability, not a per-table permission grant; code constrains every read to the configured database/table. No write/delete/users/teams/storage scopes or permanent Appwrite API key are required. Keep existing table/row security private and unchanged.

The returned `$id` must match `leadId`. Unknown rows and populated `deletedAt` values receive the same safe 404-style unavailable response. Any populated deletion marker, even malformed, fails closed. The stored email must be one valid bare mailbox, without display names, lists, whitespace, or header controls. Missing/invalid email or missing name/service prevents sending. Database configuration and SDK/provider failures return safe failure without internal details.

The Function makes zero `createRow`, `updateRow`, `upsertRow`, or `deleteRow` calls. It does not record sent emails or alter status, notes, or timestamps.

## Sender, recipient, and template

From is constructed as `StackNova Technologies <${env.RESEND_FROM_EMAIL}>`. Configure `RESEND_FROM_EMAIL=sales@stacknova.in`; the result is **StackNova Technologies <sales@stacknova.in>**. To is exclusively the validated database `lead.email`. The Resend subject is the trimmed admin-entered subject, with no prefix. Reply-To is omitted, so normal replies target the sender's sales inbox; the lead's address is never set as Reply-To.

`src/email-template.js` contains a controlled adaptation of the working Stitch-style customer visual shell, using `docs/email-template/screen.png` as the reference. Each Function deploys independently, so the new Function contains its own stable template and asset helper. There are no cross-Function runtime imports. Customer and admin-notification templates share one local light-shell helper inside submit-enquiry; direct messages use their own self-contained shell. The existing public enquiry behavior is preserved.

The HTML uses a light gray page, centered white bordered card with a 14px radius, cyan top accent, centered 210x70px CID logo inside the card above the badge, matching fonts/spacing, service inset, sign-off, and footer. Direct-message content is:

- Badge: STACKNOVA MESSAGE
- Heading: Message from StackNova Technologies
- Greeting: Hi lead name,
- Admin-entered message
- YOUR PROJECT / SERVICE and the stored service
- Best regards, The StackNova Technologies Team
- StackNova Technologies; Thoughtful engineering. Clear communication.; current-year copyright

The direct email never uses ENQUIRY RECEIVED or Thanks for reaching out. All dynamic name, service, and message HTML is escaped. Only after escaping are CRLF/CR/LF converted to `<br>`, so typed scripts/HTML render as text. Plaintext contains the greeting, original validated message, service, sign-off, tagline, and copyright.

The approved logo is copied unchanged into `assets/stacknova-logo.png`. The helper loads it relative to its deployed module and sends base64 attachment content with `contentId: "stacknova-logo"`; HTML references `cid:stacknova-logo`. No hosted logo URL or screenshot/reference asset is required at runtime. Include assets in every deployment.

## Confirmed send and frontend behavior

The server waits for Resend and requires an acceptance ID without a returned provider error. Success returns HTTP 200:

```json
{"success":true,"message":"Email sent successfully."}
```

Sending has an eight-second abort signal and no automatic application retries. Provider errors, exceptions, absent acceptance IDs, and timeouts return a safe failure. Unlike enquiry submission, there is no successful database creation to preserve or report: email acceptance is the only success criterion. Logs contain fixed outcome messages and never raw errors, addresses, message content, bodies, or credentials. Acceptance proves the provider accepted the request, not inbox delivery. A timeout can leave acceptance uncertain; there is no cross-request idempotency/history in this feature.

The panel sits below Private Notes in the right column and stacks with the existing mobile layout. To is text, not an editable field. Optional comma-separated CC and BCC fields sit between To and Subject and reuse the public Contact field styling. During send a synchronous lock prevents duplicate submissions, all four draft fields/button are disabled, and the button says Sending.... Pending lead mutations also disable submission. Confirmed success shows Sent and Email sent successfully., then clears CC, BCC, Subject, and Message. Safe failure shows Unable to send email right now. and preserves all four drafts for deliberate retry.

An SDK authentication 401 or completed Function response with status 401 uses LeadsProvider's existing private-cache clearing and controlled central auth recheck; no retry loop is added. SDK or completed Function permission 403 preserves the session and drafts. Internal database 401/403 failures are safe server failures, not browser session failures. Responses belonging to a different lead, identity, logged-out session, archived lead, or unmounted panel cannot update its state. Existing archived-detail unavailability remains.

## Historical initial setup (current values remain applicable)

1. Open the existing Appwrite project → Functions → create **send-lead-email**. Record its ID.
2. Select the same compatible Node runtime as the current submit-enquiry Function (Node 22 or newer, matching the package's engines).
3. Set entrypoint to `src/main.js` and build command to `npm ci --omit=dev --ignore-scripts`. For Git deployment set root directory to `functions/send-lead-email`; for manual upload the archive root contains package.json.
4. Settings → Execute access: remove all other roles and grant only the existing StackNova Admins team. Verify no Any, Guests, or all Users grant exists.
5. Settings → Scopes: select **rows.read only**; remove all unnecessary scopes.
6. Leave Events empty and Schedule unset. Set Function timeout to **30 seconds**.
7. Configure Function-only variables below. Keep RESEND_API_KEY secret and its verified sender domain configured in Resend. Do not put the key in source, Git, frontend .env.local, or NEXT_PUBLIC variables.
8. Deploy and activate the new archive described below. Redeploy after Function variable/configuration changes as needed.
9. Add `NEXT_PUBLIC_APPWRITE_SEND_LEAD_EMAIL_FUNCTION_ID=<new-function-id>` to root `.env.local`. Existing endpoint/project/team/database/table configuration stays in place. Restart development or rebuild and deploy the static frontend: public environment values are bundled at build time.
10. For the email-consistency + CC/BCC update, also redeploy submit-enquiry with its updated customer/admin templates and CID attachment support. No variables, scopes, permissions, or schema changes are needed.

```dotenv
# New Function only
DATABASE_ID=<existing-private-database-id>
LEADS_TABLE_ID=<existing-leads-table-id>
RESEND_API_KEY=<secret>
RESEND_FROM_EMAIL=sales@stacknova.in
```

Appwrite supplies APPWRITE_FUNCTION_API_ENDPOINT, APPWRITE_FUNCTION_PROJECT_ID, and runtime x-appwrite-key. No ALLOWED_ORIGINS variable is needed: the browser invokes Appwrite's authenticated SDK endpoint, which uses the existing Web platform/session configuration.

```dotenv
# Frontend: public identifier only
NEXT_PUBLIC_APPWRITE_SEND_LEAD_EMAIL_FUNCTION_ID=<new-function-id>
```

## Deployment archive

From the repository root:

```powershell
tar.exe -czf "$env:TEMP/stacknova-send-lead-email.tar.gz" -C functions/send-lead-email package.json package-lock.json src assets
tar.exe -tzf "$env:TEMP/stacknova-send-lead-email.tar.gz"
```

Exact contents:

```text
package.json
package-lock.json
src/
  main.js
  email-template.js
  email-assets.js
assets/
  stacknova-logo.png
```

Exclude node_modules, tests, .env files, secrets, frontend code, and docs. Appwrite installs pinned dependencies during the build. Upload this fresh archive through the new Function's Deployments tab and activate it after a successful build.

## Local verification

```powershell
node --test tests/*.test.cjs
npm.cmd --prefix functions/send-lead-email test
npm.cmd --prefix functions/submit-enquiry test
npm.cmd run build
```

Tests mock Function/database/provider calls. The installed TablesDB SDK is intercepted to verify a configured GET with runtime credentials; the installed Resend SDK's fetch is intercepted to verify sender, recipient, subject, plaintext, and inline logo wire fields. No automated test sends real email. Existing admin/auth/read/write/Phase 8/enquiry regressions remain included.

Local verification on 2026-10-10: **372 tests passed** (255 root frontend/admin tests, including 53 new email tests; 70 new Function/template tests; 47 existing submit-enquiry/Resend tests). The final `npm.cmd run build` passed compilation, lint, type checks, and all eight static pages. `git diff --check` passed. The deployment archive was generated and its file list verified against the contents above. No Appwrite Console changes, live email sends, or inbox verification were performed.

Static export remains compatible: this feature adds a browser SDK call and an independent Appwrite Function, without Next.js API routes, SSR, middleware, server actions, or dynamic routes. The build regenerates dist; restart any development server afterward because this project shares dist between development and export artifacts.

## Live verification checklist — pending

Only user-performed deployed verification can confirm live delivery. Local tests/build do not complete this checklist.

1. Deploy/activate send-lead-email and verify its team-only Execute permission and rows.read-only scope.
2. Configure the frontend Function ID and restart/rebuild it.
3. Login as an authorized StackNova admin and open a real active lead whose inbox can be checked.
4. Confirm To shows that lead's email and is not editable.
5. Enter a custom subject and multiline message, then Send Email.
6. Verify Sending..., disabled fields/button, no duplicate request, and confirmed success with cleared fields.
7. Check the lead inbox and Resend delivery status if needed.
8. Verify From is StackNova Technologies <sales@stacknova.in> and To is the opened lead's stored email.
9. Verify the custom subject/message and preserved line breaks.
10. Verify the light Stitch-style branded card, inline logo, service inset, direct-message wording, sign-off, and footer on desktop/mobile email clients.
11. Reply and verify the reply goes to sales@stacknova.in.
12. Temporarily remove the Function's StackNova Admins Execute permission; keep the existing signed-in admin session.
13. Attempt a send and verify safe failure, preserved CC/BCC/subject/message, no success, and no forced logout. Restore the team Execute permission immediately afterward.
14. Confirm archived/unknown lead detail URLs remain unavailable and cannot show the send form. Confirm no lead data changed from sending.

Official references: [Function configuration/Execute access](https://appwrite.io/docs/products/functions/functions), [synchronous executions](https://appwrite.io/docs/products/functions/execute), [runtime credentials and development](https://appwrite.io/docs/products/functions/develop).

## Historical email consistency and CC/BCC deployment update

The latest visual source of truth is `docs/email-template/screen.png`: all three outgoing HTML emails use the same light gray background, white bordered card, cyan accent, typography/spacing, and footer. The existing packaged logo is centered **inside** the main card at **210 x 70 pixels** (about 5% wider than the reference's 200px mark), above the badge. Desktop card padding is 40px; email-safe narrow-screen styles reduce it to 32px vertically/24px horizontally. The logo remains a CID attachment. No artwork was changed, and runtime templates do not read the screenshot or frontend assets.

Customer confirmation retains its acknowledgement wording and subject. Admin New Lead Received is fully converted from dark to light, retaining Name, Email, Phone, Company, Service, Source, Status, and Project Description. Its configured admin recipient and customer Reply-To are unchanged; it now receives the packaged CID logo too. Direct messages retain their own purpose/subject/message/service content. All three preserve HTML escaping and plaintext.

### Copy recipients

Enter optional CC/BCC as comma-separated **bare** email addresses, for example `person@example.com, another@example.com`. A blank or spaces-only field means no copies. Addresses are trimmed; empty items (including leading/trailing/doubled commas), display names, malformed addresses, controls/newlines/tabs, overlong addresses, and more than **10 supplied entries per field** are rejected. The 10-entry cap applies before deduplication. Each address is limited to 254 characters. Invalid frontend input shows associated field-level feedback and makes no Function request.

The frontend sends only `{ leadId, subject, message, cc?: string[], bcc?: string[] }`. Empty normalized lists are omitted. The Function independently requires optional arrays, validates every string/type/count/blank/control/format, and rejects unsupported fields including `to` and `recipientEmail`. Omitted lists and empty arrays mean no copies; strings, null, and other malformed values do not.

Deduplication is case-insensitive across the complete address while preserving the first trimmed representation within each list. BCC takes precedence when an address appears in both lists; it is removed from CC. After the authoritative lead is read, the Function removes `lead.email` from both lists case-insensitively. Only that database email supplies primary To; the browser never supplies a primary address or influences which row is read.

Resend receives `to: [lead.email]`, plus nonempty `cc` and `bcc` arrays. Lists that become empty after primary-To removal are omitted. Sender, custom subject, HTML/text, CID attachment, eight-second abort signal, acceptance confirmation, and normal sales reply behavior are unchanged. CC/BCC lists are never included in HTML, plaintext, response messages, or logs; they belong only in mail headers. The direct Function still performs zero database writes.

Both **submit-enquiry and send-lead-email require redeployment** using separate archives containing package.json, package-lock.json, src/, and assets/. **Rebuild/redeploy the frontend** to publish the new inputs. No dependency upgrade, new environment variable, Function scope/permission change, table permission change, or schema change is needed.

Local verification for this update on 2026-10-10: **461 tests passed** (299 frontend/admin tests, including 92 direct-email frontend tests; 114 send-lead-email tests; 48 submit-enquiry/Resend tests). The final static build passed compilation, lint, type checks, and all eight pages. All three templates were previewed at desktop width and checked at 360px mobile width; logos remain inside their cards, with no horizontal page overflow. The desktop browser previews were visually compared with the latest screenshot. Both fresh deployment archives were generated and their source/asset lists verified. These browser checks do not establish rendering in every email client or live inbox delivery; deployed verification remains pending.

### Additional live verification ? pending

1. Redeploy and activate both Functions; rebuild/redeploy the frontend.
2. Submit a real enquiry: verify unchanged lead creation, customer acknowledgement wording, and the light New Lead notification with all fields and customer Reply-To.
3. Check the larger inside-card CID logo, branded card, current-year footer, and plaintext for all three emails in desktop/mobile email clients.
4. Send a direct message with one and multiple comma-separated CC/BCC addresses. Verify each intended inbox receives the message and its primary To remains the stored lead address.
5. Inspect received headers: CC is visible normally; BCC addresses are hidden from other recipients and absent from the body. Confirm normal replies still go to sales.
6. Test whitespace/case duplicates, an address in both lists, and primary-To duplicates; confirm normalization, BCC precedence, and no unnecessary duplicate deliveries.
7. Confirm empty copy fields omit extra recipients, invalid addresses/block counts do not send, success clears all drafts, and safe failure preserves them.
8. Recheck session/permission failures and confirm there are no lead-data changes. Automated checks do not claim live inbox verification.
