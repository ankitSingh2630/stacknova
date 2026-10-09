# Phase 4: enquiry emails with Resend

The existing static Contact form continues to POST to the `submit-enquiry` Appwrite Function. Phase 4 adds server-side customer confirmation and internal lead notification emails after the private lead has been saved. The frontend has no Resend dependency or credential. Admin screens still use mock data; no admin authentication, real admin CRUD, or notes editing is added.

## Function configuration

Configure these **Function-specific environment variables manually in Appwrite Console**, alongside the existing `DATABASE_ID`, `LEADS_TABLE_ID`, and `ALLOWED_ORIGINS`:

```dotenv
RESEND_API_KEY=
RESEND_FROM_EMAIL=
STACKNOVA_LEADS_EMAIL=
```

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Secret Resend credential, configured only in Appwrite Function settings. |
| `RESEND_FROM_EMAIL` | Verified sender address used as FROM for both outgoing emails. Configure the sender you selected for StackNova. |
| `STACKNOVA_LEADS_EMAIL` | Internal recipient for new website lead notifications. Configure the inbox you selected for StackNova. |

The **customer recipient comes dynamically from the validated, trimmed Contact form email**. It is not an environment variable. The admin email uses that same validated customer email as Reply-To; the customer email is never used as FROM.

The sender's domain must be verified in Resend before live sending. Never place the real key in source, examples, tests, Git, root `.env.local`, or any `NEXT_PUBLIC_*` variable. Uploading `.env.example` does not configure Function variables. Appwrite authentication still uses the runtime `x-appwrite-key`; no permanent Appwrite API key is needed.

Keep `ALLOWED_ORIGINS=http://localhost:3000` for the existing local flow. Existing OPTIONS, POST, exact origin matching, and CORS headers on safe responses are preserved; do not use a wildcard. Keep the table private, each new row's `permissions: []`, and the Function scope at only `rows.write`.

## Operation order and failure behavior

1. Check CORS/request format, validate and trim the public payload, and verify database configuration.
2. Await the existing single `TablesDB.createRow()` with the same database/table targets and runtime credentials. Assign `status: "New"` and `source: "StackNova Website"` server-side. Omit `notes`, `deletedAt`, and caller-supplied metadata.
3. Only after the database promise resolves successfully, check email configuration and initialize the Resend client as needed.
4. Attempt customer confirmation and admin notification independently using `Promise.allSettled`. The customer operation starts first, but the admin operation does not wait for it to complete. Each provider request has an eight-second abort signal; no automatic application retries are added.
5. Wait for both operations to settle, log safe operation outcomes, and return the existing HTTP 201 response:

```json
{"success":true,"message":"Thank you! Your enquiry has been submitted successfully."}
```

| Outcome | Behavior |
| --- | --- |
| Database fails | No Resend initialization or email attempts. Return existing safe HTTP 500 response. |
| Customer email fails | Keep the lead, log customer failure, still attempt admin email, return HTTP 201. |
| Admin email fails | Keep the lead, log admin failure, customer operation is unaffected, return HTTP 201. |
| Both emails fail | Keep the lead, log both failures, return HTTP 201. |
| Missing/blank `RESEND_API_KEY` or `RESEND_FROM_EMAIL` | Skip both affected email operations and log missing key names separately for each operation. Still save the lead and return HTTP 201. |
| Missing/blank `STACKNOVA_LEADS_EMAIL` | Skip only the admin email and log the missing key name; customer confirmation is still attempted. Return HTTP 201. |

Email errors never delete, update, or roll back the saved lead. Both thrown errors and Resend's returned `error` result are handled. An absent provider acceptance ID also counts as an email failure. A provider acceptance log means the send API accepted the message; it does not prove inbox delivery. A timeout can leave provider acceptance uncertain.

Appwrite `log` records which operation was accepted; Appwrite `error` records which operation failed or was skipped. Diagnostics whitelist scalar name/message/code/status/type fields, redact the configured Resend key and request credentials, remove control characters, and limit diagnostic length. Raw response objects, stacks, headers, environment dumps, and credentials are never logged or sent to the browser. A logging failure cannot change a saved enquiry's response.

## Templates and dependency

`functions/submit-enquiry/src/email-templates.js` contains:

- `buildCustomerConfirmationEmail`: StackNova wordmark, thanks/greeting, acknowledgement, selected service summary, review/follow-up expectation, and team signature. No exact response-time promise or internal lead data.
- `buildAdminLeadEmail`: new-lead heading, New badge, labelled Name/Email/Phone/Company/Service/Source/Status table, multiline Message section, and direct-reply instruction. An omitted company is shown as “Not provided.”

Both templates provide HTML and plain text. HTML uses the site's navy (`#070B14`, `#090D18`, `#0B1020`), blue (`#2563EB`), and cyan (`#06B6D4`) palette, readable contrast, fallback fonts, inline styles, fluid table widths, and a 600-pixel maximum card. Every submitted value included in HTML is escaped before interpolation; message line breaks are added only after escaping. There are no external assets, scripts, tracking pixels, or animations.

The official `resend` package is pinned to **6.9.4** only in the Function package and lockfile. This version supports the required send fields and abort signal without SDK-generated raw provider-error logging. The intercepted SDK test checks that behavior; retain that test when upgrading. No React Email template dependency is required.

## Redeployment

**Redeployment is required after these code/dependency changes and after configuring the Function variables.** Keep the existing Node.js 22-or-newer runtime, execute access, scope, and deployment settings:

- Root directory: `functions/submit-enquiry`
- Entrypoint: `src/main.js`
- Build command: `npm ci --omit=dev --ignore-scripts`
- Function timeout: retain the existing 30-second setting; the two email requests run concurrently with eight-second limits after storage. The frontend retains its existing 35-second request timeout.

For manual deployment, create a **fresh** archive from the updated source and lockfile:

```powershell
tar.exe -czf "$env:TEMP/stacknova-submit-enquiry.tar.gz" -C functions/submit-enquiry package.json package-lock.json src
```

Upload it in Appwrite Console, deploy, and activate it. Do not reuse an older archive. Do not upload `node_modules`, secret files, or frontend code. The existing Contact form and public Function URL need no Phase 4 change.

## Verification

Run from the repository root:

```powershell
npm.cmd --prefix functions/submit-enquiry test
node --test tests/enquiry.test.cjs tests/contact.test.cjs
npm.cmd run build
```

Function tests stub email sending or intercept the official SDK's fetch. They never call the real Resend API. Coverage includes both successes, independent thrown/returned failures, database-before-email ordering, no client initialization on database failure, addressing/Reply-To, missing configuration, secret redaction, template escaping/content, omitted notes, forced status, and existing validation/CORS behavior.

After manual configuration and redeployment, submit a real enquiry from the existing localhost Contact form. Verify the row exists in private Appwrite storage with New status and empty notes, the customer receives the branded confirmation, the configured internal inbox receives all lead fields, and replying to the admin notification targets the submitted customer address. Check Function logs and Resend delivery status if either email is absent. A successful browser response proves storage, not email delivery.

**Live Resend sending is unverified by local unit tests or the static build.** Confirm it only after a deployed Function sends a real enquiry's emails. Stop at Phase 4; Phase 5/admin authentication is out of scope.

Local implementation verification on 2026-10-09: all 42 Function tests and nine frontend regression tests passed. `npm.cmd run build` passed and generated all eight static pages. Browser previews of both HTML templates were reviewed at desktop and 320-pixel mobile widths using artificial enquiry data. This checks browser layout; common-email-client rendering and live email delivery still require deployed verification. Contact, admin mock components, root dependencies, and static-export configuration were unchanged by Phase 4. The build regenerated `dist/`.

## Official references

- [Resend Node.js sending guide](https://resend.com/docs/send-with-nodejs)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend SDK 6.9.4](https://github.com/resend/resend-node/tree/v6.9.4)
