# Phase 4: enquiry emails with Resend

> Phase 10 handoff: follow [deployment readiness](deployment-readiness.md) and [final QA](final-qa.md) for current operational instructions and verification status. Dated results and earlier-phase scopes below are historical records; they do not establish live deployment or delivery.

> Current security behavior is documented in [Phase 9 security hardening](phase-9-security-hardening.md). Source is now server-owned only, raw controls and practical mailbox syntax are enforced, configured sender/admin addresses are validated, and logs omit arbitrary provider text. Templates and authenticated admin Send Email/CC/BCC are unchanged. Historical phase summaries below retain their original verification context.

## Historical Phase 4 scope

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
| `RESEND_FROM_EMAIL` | Verified bare sender address. Both emails format it as `StackNova Technologies <configured-address>`; keep the existing verified email unchanged. |
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

Appwrite `log` records which operation was accepted; Appwrite `error` records which operation failed or was skipped. Diagnostics include only fixed operation/failure descriptions, internally selected missing/invalid configuration variable names and integer HTTP codes in 100-599. Arbitrary exception name/message/type, customer email/phone/message, raw responses, stacks, headers, environment dumps and credentials are never logged or returned. No redaction framework is required. A logging failure cannot change a saved enquiry's response. Configured sender/admin addresses must each be a valid single bare mailbox; invalid sender skips both operations, while invalid admin recipient skips only the admin operation after the lead is saved.

## Templates and dependency

`functions/submit-enquiry/src/email-templates.js` contains:

- `buildCustomerConfirmationEmail`: light off-white background, larger centered CID logo inside a white 600-pixel bordered card, cyan top accent, outlined enquiry badge, greeting, selected-service inset, review/follow-up text, divider, team signature, and centered footer with the current year. The requested wording includes a technical consultant usually following up within 1 business day. No internal lead data is included.
- `buildAdminLeadEmail`: light New Lead Received heading, NEW WEBSITE ENQUIRY badge, New status badge, labelled Name/Email/Phone/Company/Service/Source/Status table, multiline Message / Project Description section, and direct-reply instruction. It now uses the same light shell/logo/sign-off/footer as the customer email, while preserving its subject, recipient, customer Reply-To, and all useful fields.

Both templates provide HTML and plain text. The customer design follows `docs/email-template/screen.png`, which is a design reference only and is never imported or packaged into the Function. Table layouts, inline styles, safe fallback fonts, and a fixed-width Outlook wrapper keep the layout conservative. Rounded corners may render square in some Outlook versions. Every submitted value included in HTML remains escaped before interpolation; message line breaks are added only after escaping. There are no scripts, tracking pixels, animations, or external CSS.

The approved `brand/t_logo-master.png` is copied unchanged to `functions/submit-enquiry/assets/stacknova-logo.png`. `src/email-assets.js` loads only that deployment-owned asset when building the customer email, after database success and email configuration checks. Resend receives its bytes as an inline attachment with `contentId: "stacknova-logo"`; HTML uses `src="cid:stacknova-logo"` with descriptive alt text. No publicly hosted image URL is required. The admin notification receives the same packaged CID logo attachment. Include `assets/` in every deployment archive. A missing asset is isolated as a customer-email failure; the saved lead and admin email remain unaffected.

Both sender values are constructed in code as `StackNova Technologies <${env.RESEND_FROM_EMAIL}>`. The environment variable remains a bare verified address, with no new variable or sender email. Customer subject and admin Reply-To are unchanged. Customer plaintext matches the redesigned HTML wording, service summary, follow-up, sign-off, and footer.

The official `resend` package is pinned to **6.9.4** only in the Function package and lockfile. This version supports the required send fields and abort signal without SDK-generated raw provider-error logging. The intercepted SDK test checks that behavior; retain that test when upgrading. No React Email template dependency is required.

## Redeployment

**Redeployment is required after these code/dependency changes and after configuring the Function variables.** Keep the existing Node.js 22-or-newer runtime, execute access, scope, and deployment settings:

- Root directory: `functions/submit-enquiry`
- Entrypoint: `src/main.js`
- Build command: `npm ci --omit=dev --ignore-scripts`
- Function timeout: retain the existing 30-second setting; the two email requests run concurrently with eight-second limits after storage. The frontend retains its existing 35-second request timeout.

For manual deployment, create a **fresh** archive from the updated source and lockfile:

```powershell
tar.exe -czf "$env:TEMP/stacknova-submit-enquiry.tar.gz" -C functions/submit-enquiry package.json package-lock.json src assets
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

## Historical customer-email update before Phase 9

Redeploy the Function with the updated source and packaged logo asset. No frontend/admin, Phase 8 query, schema, permission, scope, validation, or public lead-creation changes are part of this update. Keep the existing Function variables and verified sender address. Verify the customer light-card layout and inline logo in Gmail desktop/mobile, Outlook, and Apple Mail after a real deployed submission; confirm both emails show the StackNova Technologies sender name and the admin Reply-To still targets the customer. Automated tests do not prove live delivery or email-client rendering.

Local verification: all 47 Function/Resend tests passed, including the five added template/sender/asset tests. The official SDK send is intercepted; its customer attachment payload is verified as base64 with the matching content ID. No live Resend request was made.

## Historical email consistency + CC/BCC deployment update

The updated `docs/email-template/screen.png` is the visual source of truth. Customer confirmation, internal New Lead Received notification, and direct lead messages now follow one light StackNova system: off-white outer background, centered white bordered 600px card, cyan top accent, 14px radius, consistent typography/spacing/sign-off/footer, and current-year copyright. The **210 x 70px packaged CID logo is inside the main card above the badge**, enlarged about 5% beyond the reference's 200px mark. It no longer sits outside/above the card. Narrow-screen card padding is reduced safely; Outlook retains a conservative fixed-width wrapper.

The two submit-enquiry templates reuse a local light-shell helper because they deploy together. The independently deployed send-lead-email Function contains its own self-contained implementation; there are no runtime cross-Function imports. Existing packaged assets are reused without modifying the artwork. All dynamic HTML values remain escaped, multiline messages remain safely formatted, and every template supplies plaintext.

The admin notification's old dark presentation is completely removed. Name, Email, Phone, Company, Service, Source, Status, message content, subject, admin inbox, and customer Reply-To are preserved. Both send operations now attach the same CID logo. Customer acknowledgement wording, subject, lead-first ordering, independent best-effort email outcomes, CORS, and Contact behavior remain unchanged.

Optional CC/BCC apply only to authenticated direct lead messages, not public enquiry submission. The UI accepts comma-separated addresses; the frontend sends optional normalized arrays. Each list accepts at most 10 supplied entries before case-insensitive deduplication, with trimmed first representations retained. BCC wins over CC; authoritative database lead.email is removed from both lists server-side. Blank lists are omitted. Both frontend and Function validate format/types/controls/blanks/counts. Copy lists appear only in headers, never templates/plaintext/logs. See [Admin lead email](admin-lead-email.md) for the precise request and validation rules.

**Redeploy both Functions** with fresh separate package.json/package-lock.json/src/assets archives, and **rebuild/redeploy the frontend** for the new CC/BCC fields. No new variables, scopes, permissions, schema, or dependencies are required. Keep submit-enquiry at its existing scope/execute configuration and send-lead-email team-only with rows.read.

Live verification remains pending: check all three delivered HTML/plaintext emails, larger inside-card CID logo in desktop/mobile clients, admin notification's customer Reply-To, direct-message sales reply behavior, CC delivery, BCC privacy, duplicate handling, and success/failure draft behavior. Local mocked tests do not send live email or establish inbox delivery.

Local verification on 2026-10-10: all 48 submit-enquiry/Resend tests passed, along with 114 direct-email Function tests and 299 frontend/admin tests (461 total). The final static build passed all checks and eight generated pages. Customer/admin/direct templates were visually compared at desktop width against the updated reference, with narrow-screen layout checks at 360px. The two deployment archives contain package.json, package-lock.json, src/, and assets/; no environment secrets, tests, or node_modules are packaged. No live send or deployment was performed.
