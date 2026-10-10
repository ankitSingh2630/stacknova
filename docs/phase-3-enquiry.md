# Phase 3: public enquiry submission

> Current Phase 9 contract: only name/email/phone/company/service/message are public fields; source is server-owned and rejected in requests. Admin integration and enquiry emails are now implemented. See [Phase 9 security hardening](phase-9-security-hardening.md) for current validation, logging, deployment order, permissions and intentional anti-abuse limitations. Historical verification sections below describe their original phases.

The static Contact form sends a JSON POST to the `submit-enquiry` Appwrite Function. The Function validates the input and creates one private `leads` row using the server SDK and execution-provided credential. Admin screens still use mocks. This phase contains no email delivery, login, real admin data operations, Next.js API routes, server actions, or SSR.

## Appwrite Console setup

1. Open the existing StackNova project. Verify the existing `leads` table before deploying; no schema changes are made by this code.
2. Under Functions, create a Function with **ID `submit-enquiry`** and **name `submit-enquiry`**. Select **Node.js 22** (or a supported newer Node.js runtime).
3. Set **Execute access: Any** on the Function. This allows unauthenticated enquiries. It does not grant any access to the database.
4. Under Function scopes, select **only `rows.write`**. Leave read, database/table/column administration, authentication, messaging, and other scopes unchecked.
5. Keep event triggers and schedules empty. Set the Function timeout to 30 seconds. Only HTTP POST creates a lead; OPTIONS handles browser preflight without a write.
6. Set the Function environment variables below and redeploy after changes.

`rows.write` is Appwrite's minimum scope for creating rows. It also permits row updates/deletes and is not limited to this table by table permissions. The code constrains this privilege: database and table IDs come only from Function configuration; the only database operation is `createRow`; arbitrary fields and target IDs are rejected. Do not broaden scopes to compensate for a deployment/schema problem.

### Function environment

| Variable | Value |
| --- | --- |
| `DATABASE_ID` | ID of the existing StackNova database. |
| `LEADS_TABLE_ID` | ID of the existing `leads` table, not its display name unless identical. |
| `ALLOWED_ORIGINS` | `http://localhost:3000` |

Current Phase 3 verification requires localhost only. When production deployment access is available later, change `ALLOWED_ORIGINS` to `http://localhost:3000,https://stacknova.in,https://www.stacknova.in` and redeploy. Production-domain testing is deferred and does not block localhost verification. Never use `*`.

These variables belong in **Function settings**, not the frontend `.env.local`. The Function's `.env.example` is documentation only; uploading it does not configure Appwrite. Use Function-specific variables rather than project-wide values where possible. Do not create custom variables using the reserved `APPWRITE_` prefix.

Appwrite injects `APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID`, and the execution's `x-appwrite-key` header. The Function uses those values. No manually configured API key, browser session, JWT, or committed key is required. Never log the execution headers or paste a privileged key into `NEXT_PUBLIC_*`.

### Verify the existing table

The existing columns must accommodate the following constraints (limits use JavaScript string length):

| Column | Maximum input length / server value |
| --- | --- |
| `name` | 100, required |
| `email` | 254, required |
| `phone` | 32, with 7–15 digits, required |
| `company` | 150, optional, stored as an empty string if omitted |
| `service` | 100; one of the website's six existing Project Type choices |
| `message` | 4,000, including an optional appended Budget line |
| `source` | Server assigns `StackNova Website`; client-supplied source is rejected |
| `status` | Server assigns enum value `New` |
| `notes` | Optional Text for internal admin notes; no index required; omitted during public lead creation |
| `deletedAt` | Optional; omitted during public lead creation |

If existing column sizes are smaller, tighten both `lib/enquiry.ts` and `functions/submit-enquiry/src/main.js` before use. Do not grant extra permissions to fix schema errors. The Function stores text, without interpreting it as HTML. Future viewers must render message text safely rather than using raw HTML.

Use Appwrite metadata for `$id`, `$createdAt`, and `$updatedAt`. The Function generates an ID and passes `permissions: []`, with no caller-supplied metadata or permissions. Leave the table private: **no Any read/create/update/delete** on the table and no public row permissions. Internal notes live in `leads.notes` and remain empty until an authenticated admin updates them in a later integration phase. The Contact form does not supply notes, and the Function does not send them.

## Deployment

The Function is a separate package under `functions/submit-enquiry`; the root website dependencies do not include the server SDK.

### Git deployment

Connect your repository to the Function in Appwrite, then configure:

- Root directory: `functions/submit-enquiry`
- Entrypoint: `src/main.js` (relative to that root)
- Build command: `npm ci --omit=dev --ignore-scripts`

Deploy the chosen branch and activate the deployment. Do not upload `node_modules`, `.env.local`, frontend files, or the whole static site as Function source.

### Manual deployment

From the repository root in PowerShell, package only the required Function source and dependency files:

```powershell
tar.exe -czf "$env:TEMP/stacknova-submit-enquiry.tar.gz" -C functions/submit-enquiry package.json package-lock.json src assets
```

In Appwrite, open `submit-enquiry` > Deployments > Create deployment, upload the archive, set entrypoint `src/main.js` and build command `npm ci --omit=dev --ignore-scripts`, then deploy and activate it. Ensure the three Function variables, execute access, and scopes are configured.

### Obtain the public URL and configure the site

1. Once the deployment is active, open the Function's **Domains** tab.
2. Copy the **generated HTTPS domain**, usually ending in `.appwrite.run`. Use the Function domain, not the Appwrite API endpoint or Console URL. No custom DNS is required.
3. Add this value to the site's existing `.env.local`, preserving all existing values:

```dotenv
NEXT_PUBLIC_ENQUIRY_FUNCTION_URL=https://YOUR-GENERATED-FUNCTION-DOMAIN.appwrite.run
```

4. Restart `npm.cmd run dev` for local testing. For production, set the variable in the build environment, run `npm.cmd run build`, and deploy the contents of `dist/` to the static host. Public environment values are compiled into browser assets, so a rebuild is required after URL changes.

The local `.env.local` contains an empty `NEXT_PUBLIC_ENQUIRY_FUNCTION_URL` placeholder; set it to the generated HTTPS Function URL after deploying. Existing environment values are preserved. No live lead creation/permissions have been verified.

## Request and response

```json
{
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "phone": "+91 9876543210",
  "company": "ABC Technologies",
  "service": "Web Development",
  "message": "I need a website for my business."
}
```

Company may be omitted or be an empty string; null is rejected. Controls are checked before trim, and required fields are independently validated on both sides. Budget remains optional in the form and is appended to `message`; there is no new budget column or separate request property. A blank project message remains invalid even with a budget. The textarea reserves space for the selected Budget suffix, and final combined-message validation still enforces 4,000 characters on both sides. Selecting a budget after typing a long message shows a field error without deleting text; shorten the message or remove the optional budget. The Function rejects unknown fields, including `source`, `status`, `deletedAt`, timestamps, IDs, database/table IDs, and permissions. It rejects malformed JSON, non-string fields, invalid raw control characters, oversized strings, unsupported services, and bodies larger than 32 KiB. Email requires one practical bare mailbox; see Phase 9 for exact control/format rules.

Success, after the write completes:

```json
{"success":true,"message":"Thank you! Your enquiry has been submitted successfully."}
```

Validation example:

```json
{"success":false,"message":"Invalid enquiry details."}
```

Server failure:

```json
{"success":false,"message":"Unable to submit your enquiry right now."}
```

HTTP statuses: 201 saved; 400 invalid body; 403 rejected origin/preflight; 405 unsupported method; 413 oversized body; 415 unsupported content type; 500 backend/configuration failure. Responses contain no IDs, configuration, keys, raw exceptions, or stack traces. Backend logging uses fixed operation/failure descriptions, known configuration names and safe numeric HTTP codes only; arbitrary provider/customer text is omitted. The browser displays recognized contract messages and a generic fallback for unexpected/infrastructure responses. `submitEnquiry()` catches request setup, configuration, serialization, fetch, timeout, and JSON parsing errors and always resolves to a safe `EnquiryResponse`; Contact does not duplicate this catch. Editing revalidates the corresponding stale field error and clears old failure feedback. Success feedback persists until the next submission; only success resets the fields and errors.

## Origins and duplicate requests

`ALLOWED_ORIGINS` is a comma-separated list of complete origins, with no paths or trailing slashes. Matching is exact. No wildcard origins are allowed. Requests without an approved Origin (including `null`) are rejected before database access. Responses for approved origins include that origin and `Vary: Origin`, including errors. Credentials are omitted. JSON requests use an OPTIONS preflight that allows only POST and Content-Type; it never creates a lead.

Origin checks constrain browser callers; they are not authentication or comprehensive spam protection. Non-browser clients can spoof Origin. This public Function intentionally accepts anonymous enquiries. Also verify deployed gateway responses do not introduce a wildcard CORS header.

An immediate browser ref lock and disabled form controls prevent repeated submissions while pending, including submissions before React updates the button. Neither browser nor Function retries automatically. Exactly one create is attempted per accepted request. This does not deduplicate separate requests, other tabs, reloads, or manual retries. A timeout can follow a successful save; the timeout message explains that receipt could not be confirmed. Do not assume no lead was saved and automatically resubmit.

## Tests before deployment

```powershell
npm.cmd ci --prefix functions/submit-enquiry --ignore-scripts
npm.cmd test --prefix functions/submit-enquiry
node --test tests/enquiry.test.cjs tests/contact.test.cjs
npm.cmd run build
```

Backend tests use fake configuration and stubbed database writes; they do not contact Appwrite. They verify rejected inputs cannot write, server-owned values, one write per accepted request, safe failures, and CORS. Build success confirms the Next.js static export. Browser checks with simulated responses do not establish live Appwrite persistence.

## Live checks after deployment

1. Open `http://localhost:3000`, submit an empty/invalid form, and verify clear errors, focus on the first invalid field, and no Function request.
2. Fill every required field and submit. In browser Network tools, verify OPTIONS permits the exact origin and the only application POST goes to the Function domain; there must be no browser TablesDB requests. Confirm the loading state and disabled submit button, including repeated clicks/Enter.
3. Confirm HTTP 201 and the success message, and that the form resets only after success.
4. In the Appwrite Console, inspect the private leads table. Confirm exactly one new row, trimmed values, `status: New`, empty `notes` and `deletedAt`, source, system timestamps, and no public row permissions. The Function omits both optional fields. Do not use the mock admin screen as evidence of persistence.
5. Send valid JSON directly with an invalid email, then send another body containing `status: Converted`. Expect 400 and verify no new row appears. This exercises server validation independently of the form.
6. Test GET (405), text/plain POST (415), malformed JSON (400), and unapproved/missing Origin (403); none may create a lead.
7. For current localhost testing, check CORS on both success and failure responses. If using the Appwrite Console's execution tester, supply a POST, JSON Content-Type, and `Origin: http://localhost:3000`. Testing from `https://stacknova.in` and `https://www.stacknova.in` is deferred until production access is available.
8. Verify the table still denies unauthenticated read/create/update/delete and the row has no public permissions. Keep these checks read-only or use a dedicated test project for destructive permission probes.

PowerShell example for an independent server-validation check (replace the public URL):

```powershell
$functionUrl = 'https://YOUR-GENERATED-FUNCTION-DOMAIN.appwrite.run'
$invalidBody = @{ name='Test'; email='invalid'; phone='+91 9876543210'; service='Web Development'; message='Phase 3 validation test' } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri $functionUrl -Method Post -ContentType 'application/json' -Headers @{ Origin='http://localhost:3000' } -Body $invalidBody
} catch {
  Write-Output "HTTP status: $([int]$_.Exception.Response.StatusCode)"
}
```

Stop after Phase 3. Email/Resend and admin authentication/data integration belong to later phases.

## Official references

- [Function execution and public execute access](https://appwrite.io/docs/products/functions/execute)
- [Function runtime credentials](https://appwrite.io/docs/products/functions/develop)
- [Function variables and redeployment](https://appwrite.io/docs/products/functions/environment-variables)
- [Generated HTTPS domains](https://appwrite.io/docs/products/functions/domains)
- [TablesDB server SDK](https://appwrite.io/docs/references/cloud/server-nodejs/tablesDB)

## Phase 3 cleanup verification — 2026-10-09

- `npm.cmd run build` passed with all eight static pages generated. The restricted-network attempt could not fetch the existing Google Fonts; the network-enabled retry passed without font/design or export-architecture changes.
- All **13 Function tests** passed. Configuration and allowed-origin tests use only `http://localhost:3000`; additional tests cover CORS on error responses and the combined message/Budget length boundary. Database writes remain stubbed or intercepted.
- All **six enquiry client tests** and **three Contact handler tests** passed. These cover safe setup/network/JSON/HTTP failures, request contract, frontend/backend validation agreement, immediate duplicate protection, disabled/loading state, success/reset, failure/retention/retry, and budget-only/overflow rejection. Run them from the repository root with `node --test tests/enquiry.test.cjs tests/contact.test.cjs`.
- Browser review of the exported homepage at `http://localhost:3000` confirmed first-invalid-field focus, stale-error correction, a 3,978-character allowance with “Not sure yet”, retained 4,000-character text and a visible error after late budget selection, error clearing after budget removal, safe missing-URL failure with retained values and restored controls, cleared failure feedback on edit, Phone inside `dd`, and keyboard access to the submit button. Success and pending duplicate behavior were verified by handler tests with simulated responses.
- The intentional `mailto:hello@stacknova.in` contact-information link remains. Submission is still Contact → `submitEnquiry()` → Function → private TablesDB. No browser table calls, budget column, public permissions, permanent API key, Resend, authentication, or real admin-data integration were added. The Function runtime source required no changes; its approved-origin CORS, preflight, safe responses, and private create were already correct.
- Modified during cleanup: `components/Contact.tsx`, `lib/enquiry.ts`, `lib/appwrite/config.ts`, `.env.example`, local ignored `.env.local` (empty Function URL placeholder only), `functions/submit-enquiry/.env.example`, `functions/submit-enquiry/test/main.test.js`, `docs/phase-3-enquiry.md`, and `docs/appwrite-setup.md`. Added: `tests/enquiry.test.cjs` and `tests/contact.test.cjs`. The build regenerated `dist/`. Existing unrelated working-tree changes were preserved.
- The Function has **not been deployed or tested against live Appwrite** during cleanup. The Appwrite Console variables, scopes, actual table permissions, schema compatibility, and live persistence still require deployment and a localhost submission. Production domains do not block current localhost verification. The local public Function URL remains empty until deployment; its real value was not printed.

## Original implementation verification and file inventory

The following is the prior implementation's historical verification and generated-file snapshot, before this cleanup. Its environment-file and test-count statements describe that earlier work.

Verified locally on 2026-10-08:

- `npm.cmd run build` passed and emitted static routes to `dist/`.
- All 11 backend tests passed, including an intercepted real SDK request with empty row permissions and synthetic runtime credentials. These tests created no live leads.
- Browser checks with simulated Function responses passed: field validation/focus, trimming, optional Budget, loading, immediate duplicate-submit lock, one pending request, success/reset, safe failure/retention, and mobile layout. No browser TablesDB requests occurred.
- Final exported homepage and mock admin dashboard/list/detail routes loaded from a plain static server without missing assets or runtime errors. An unset Function URL failed safely without resetting the form.
- No Resend implementation was added. No secrets were printed. `.env.local` was not opened for inspection, edited, or included in a deployment artifact; Next.js used it normally during builds.
- Live Appwrite persistence, schema compatibility, and deployed permissions/CORS remain to be verified after deployment.

Created source/documentation files:

- `lib/enquiry.ts`
- `functions/submit-enquiry/.env.example`
- `functions/submit-enquiry/.gitignore`
- `functions/submit-enquiry/package.json`
- `functions/submit-enquiry/package-lock.json`
- `functions/submit-enquiry/src/main.js`
- `functions/submit-enquiry/test/main.test.js`
- `docs/phase-3-enquiry.md`

Modified source/documentation files:

- `components/Contact.tsx`
- `lib/appwrite/config.ts`
- `.env.example`
- `docs/appwrite-setup.md`

The build regenerated `dist/`. The complete generated-output working-tree status against Git HEAD is below (`M` modified, `D` replaced/removed, `??` untracked). Generated-output differences were already present before Phase 3; this snapshot does not attribute every difference to Phase 3. Build hashes change when rebuilding. Existing `.gitignore` and `docs/admin-ui/` working-tree changes were left alone.

```text
 M dist/404.html
 M dist/404/index.html
 M dist/_next/static/chunks/117-e173c366e2bfd494.js
 D dist/_next/static/chunks/322-3fb607bd0192792e.js
 D dist/_next/static/chunks/app/layout-a62a33ff5929c082.js
 D dist/_next/static/chunks/app/not-found-2bb844ceae3a145d.js
 D dist/_next/static/chunks/app/page-a3e5b98e27ce4076.js
 D dist/_next/static/chunks/main-app-7573f2a1b9b84198.js
 D dist/_next/static/chunks/main-b09d04ff3a501ab9.js
 M dist/_next/static/chunks/polyfills-42372ed130431b0a.js
 D dist/_next/static/chunks/webpack-22de74eaf795b1de.js
 D dist/_next/static/css/2cd462c33fb87108.css
 D dist/_next/static/vE2mXQjhN90VB1LKY0IuF/_buildManifest.js
 D dist/_next/static/vE2mXQjhN90VB1LKY0IuF/_ssgManifest.js
 M dist/index.html
 M dist/index.txt
?? dist/_next/static/5775Tj5wnHFKIR_HyMOJ9/_buildManifest.js
?? dist/_next/static/5775Tj5wnHFKIR_HyMOJ9/_ssgManifest.js
?? dist/_next/static/chunks/997-de224fb61a673643.js
?? dist/_next/static/chunks/app/admin/(workspace)/layout-eb5b52c633e0dfd8.js
?? dist/_next/static/chunks/app/admin/(workspace)/lead/page-3de11119148d7e02.js
?? dist/_next/static/chunks/app/admin/(workspace)/leads/page-c50b15b18ae3caf8.js
?? dist/_next/static/chunks/app/admin/(workspace)/page-2f2aedd5635fc579.js
?? dist/_next/static/chunks/app/admin/layout-10f8444acbac8c09.js
?? dist/_next/static/chunks/app/admin/login/page-97c2b6d5c25dd0f0.js
?? dist/_next/static/chunks/app/layout-86b845035699fce3.js
?? dist/_next/static/chunks/app/not-found-91fd910b527c150f.js
?? dist/_next/static/chunks/app/page-c24ff7dd2d551d3a.js
?? dist/_next/static/chunks/main-app-de1c195b3d4f9327.js
?? dist/_next/static/chunks/main-d1e39327824db640.js
?? dist/_next/static/chunks/webpack-12bdcc9de37dbe55.js
?? dist/_next/static/css/32948c0337d9dfda.css
?? dist/_next/static/css/bd7d61b4ff959661.css
?? dist/_next/static/css/d61e35ec8185fa9d.css
?? dist/_next/static/media/19cfc7226ec3afaa-s.woff2
?? dist/_next/static/media/21350d82a1f187e9-s.woff2
?? dist/_next/static/media/636a5ac981f94f8b-s.p.woff2
?? dist/_next/static/media/6fe53d21e6e7ebd8-s.woff2
?? dist/_next/static/media/8e9860b6e62d6359-s.woff2
?? dist/_next/static/media/8ebc6e9dde468c4a-s.woff2
?? dist/_next/static/media/9e7b0a821b9dfcb4-s.woff2
?? dist/_next/static/media/ba9851c3c22cd980-s.woff2
?? dist/_next/static/media/c5fe6dc8356a8c31-s.woff2
?? dist/_next/static/media/df0a9ae256c0569c-s.woff2
?? dist/_next/static/media/e4af272ccee01ff0-s.p.woff2
?? dist/admin/index.html
?? dist/admin/index.txt
?? dist/admin/lead/index.html
?? dist/admin/lead/index.txt
?? dist/admin/leads/index.html
?? dist/admin/leads/index.txt
?? dist/admin/login/index.html
?? dist/admin/login/index.txt
```
