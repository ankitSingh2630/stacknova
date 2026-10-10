# Phase 9: security hardening

> Phase 9 implementation record: the security contract below remains current. Its statements that Phase 10 was not started describe the Phase 9 boundary. Phase 10 now documents handoff/QA; no Function source changes are made. Live Phase 9 deployment, capacities, permissions, production CORS, persistence and delivered-email checks remain PENDING. See [deployment readiness](deployment-readiness.md) and [final QA](final-qa.md).

Phase 9 hardens the existing static Contact -> public `submit-enquiry` Function -> private TablesDB -> Resend flow. Next.js remains `output: 'export'`, with no SSR, API routes, or Server Actions. Admin authentication, team verification, queries, status/notes updates, permanent deletion, five-row pagination, filters, Send Email and its CC/BCC feature are unchanged. Phase 10 is not started.

## Public request contract

Only `name`, `email`, `phone`, `company`, `service`, and `message` are accepted. All supplied values must be strings. `name`, `email`, `phone`, `service`, and `message` are required and must be nonempty after trimming. `company` may be omitted or be an empty/whitespace-only string; omission becomes `""`. Null is rejected, including for company. Arrays, objects, numbers and booleans are rejected.

`source` is not a public request property. Source, status, notes, metadata, target IDs, permissions, addressing fields and every other unknown property are rejected. The Function alone assigns `source: "StackNova Website"` and `status: "New"`, generates the row ID, and omits notes/deletedAt. Contact no longer submits source.

Budget remains an optional fixed-choice frontend field composed into `message` as a Budget suffix. There is no separate backend budget property or column. The frontend requires project text independently and reserves room for the suffix; the Function treats the combined message as text and validates its total length. It does not infer structured budget data from message content.

## Validation and limits

Controls are checked against the original supplied string before trim. Single-line name/email/phone/company/service reject C0 U+0000-U+001F, DEL/C1 U+007F-U+009F, and Unicode line/paragraph separators U+2028/U+2029. Normal spaces are permitted before normalization where appropriate. Message permits tab, CR and LF; other C0 and DEL/C1 controls are rejected. Normal punctuation and Unicode text remain intact.

| Field | Maximum JavaScript string length after trim | Additional rule |
| --- | ---: | --- |
| Name | 100 | Required |
| Email | 254 | One practical bare mailbox; local part <=64 |
| Phone | 32 | Optional leading +; digits/spaces/parentheses/hyphens; 7-15 digits |
| Company | 150 | Optional string; omission becomes empty string |
| Service | 100 | Exact existing Project Type choice |
| Message | 4,000 | Required, including any frontend-composed Budget suffix |

Services: Web Development, Software Engineering, UI/UX Design, Cloud & Infrastructure, Product Modernization, Other. Case-sensitive matching is retained.

Email validation is a small business-contact validator, not an RFC parser: ASCII local-part letters/digits and common mailbox punctuation, no leading/trailing/consecutive local dots, and at least two alphanumeric/hyphen domain labels. Labels are at most 63 characters and cannot begin/end with a hyphen. Display names, angle brackets, quoted local parts, comma/semicolon lists, whitespace and controls are rejected. This does not establish mailbox existence or ownership.

Limits match the existing repository's documented Appwrite capacities; no conflicting smaller capacity was found. The repository does not include a live schema export. Verify actual Console column capacities read-only before deployment. Do not expand the schema in Phase 9; if a live column is smaller, report it and align both validators to that smaller capacity. Limits use JavaScript UTF-16 string length consistently with browser maxlength. No value is silently truncated.

Frontend checks are UX only. Contact preserves raw inputs for control checking; the independently deployed Function is authoritative and trims validated text before storage.

## HTTP boundary

Retain `req.bodyText` -> `Buffer.byteLength(text, "utf8")` -> guarded `JSON.parse` -> object/unknown-field validation -> text-field validation. Missing/non-text/blank/malformed bodies, null, arrays and JSON primitives are rejected. No validation framework was added. The existing 32 KiB (32,768-byte) total limit runs before parsing; overflow returns 413. It is an application check after the runtime received the body, not a gateway upload limit.

POST requires application/json; charset parameters remain supported. OPTIONS is preflight only and never writes or sends email. Unsupported methods/content types retain fixed 405/415 responses.

All malformed-body/field/unknown-property failures return HTTP 400:

```json
{"success":false,"message":"Invalid enquiry details."}
```

Database/configuration failures return HTTP 500:

```json
{"success":false,"message":"Unable to submit your enquiry right now."}
```

Successful storage retains HTTP 201 and the existing acknowledgement. Origin/preflight rejection, unsupported method/type and total-size overflow retain their safe fixed messages. No response contains IDs, environment values, credentials, raw exceptions, provider data or stack traces. The frontend accepts the new generic validation response, keeps recognized old validation messages during rollout, and normalizes unexpected responses safely.

## Email and HTML safety

Storage completes before Resend initialization. Customer confirmation and admin notification remain independent best-effort sends with their existing eight-second timeouts. Email/configuration failures never undo the lead or turn successful storage into a public failure. No retries were introduced.

`RESEND_FROM_EMAIL` and `STACKNOVA_LEADS_EMAIL` must be single bare mailboxes validated before the affected send/client initialization. They are not trimmed into validity: configuration with whitespace or controls must be corrected. Invalid sender configuration skips both sends; invalid admin-recipient configuration skips only the admin notification. Missing/invalid configuration logs variable names only.

From is constructed only from Function-owned sender configuration. Customer To is validated customer email; admin To is configured internal email; admin Reply-To is exactly the validated customer email. Customer subject is fixed; admin subject uses validated single-line name and allowlisted service. Public callers cannot supply From, To, Reply-To, CC/BCC, headers or subject. Authenticated admin Send Email and its copy recipients are unchanged.

Existing templates escape &, <, >, double quote and apostrophe before HTML interpolation. Only after escaping do message CR/LF line breaks become `<br>`. `<website>`, `Tom & Jerry`, quoted text, apostrophes, script-like text and Unicode stay meaningful in storage and plaintext; they cannot create HTML elements through interpolation. No templates/assets or design were changed.

## CORS

`ALLOWED_ORIGINS` remains a comma-separated exact list of origins. Keep localhost when needed and explicitly configure production origins, e.g. `http://localhost:3000,https://stacknova.in,https://www.stacknova.in`. HTTPS origins and HTTP localhost remain supported. Paths, trailing slashes, credentials and wildcard configuration are rejected.

Approved origins receive their exact Access-Control-Allow-Origin and Vary: Origin on success and normal errors. Missing/null/disallowed origins receive no permissive CORS header. OPTIONS permits only POST and Content-Type and does no storage/email work. Credentials remain omitted. Verify the deployed gateway does not introduce wildcard headers.

CORS protects browser behavior. It does not authenticate this public Function or prevent direct HTTP clients from supplying an approved Origin.

## Logs and environment separation

Appwrite log/error callbacks record fixed operation outcomes, a fixed failure category, internally selected missing/invalid variable names, and integer HTTP codes in 100-599 where available. Arbitrary exception name/message/type strings, raw provider responses, stacks, customer email/phone/message, full payloads, headers and environment objects are never logged by the Function. No redaction framework or customer identifiers are needed. Logging remains best effort and cannot change storage/email outcomes.

The frontend contains only browser-safe endpoint/project/database/table/team/Function identifiers. Privileged Appwrite access uses the execution's runtime key inside the Function. Resend credentials belong only in Function-specific Variables. Do not put privileged credentials in NEXT_PUBLIC_*, frontend env files or static assets.

Root `.gitignore` ignores `.env` and `.env.*` at any level and explicitly retains `.env.example`, including Function examples. Existing examples remain tracked. No real environment values were printed or overwritten. Configuration inspection found no privileged public variable references or recognizable embedded Resend/private-key credentials; deployed settings and live assets still require appropriate operational review.

## Appwrite permissions

Public Function Execute access remains Any with only the existing rows.write scope. Leads receive `permissions: []`; no public TablesDB grants are added. StackNova Admins table Read/Update/Delete remain enabled with Create disabled. The frontend team check protects workspace UX; Appwrite team permissions enforce actual data access. The admin email Function retains team-only Execute and rows.read.

Table permissions apply to every row; empty row permissions do not override table grants. When Row Security is enabled, row grants can additionally provide access. No Row Security setting, row grant, scope, table permission, schema, index or table is changed. Live Console state was not inspected by these local tests. The existing rows.write scope is broader than create-only; fixed configured targets, rejected payload metadata and the Function's sole createRow operation constrain its use.

## Verification and deployment

Automated tests use synthetic configuration and injected database/email clients, or intercept real SDK HTTP calls. They create no live rows and send no real emails. Coverage includes body/type/required/length/control/unknown-field rejection; zero writes/sends/Resend initialization on request rejection; both post-save sends and failure isolation; addressing and configuration validation; storage/plaintext preservation and HTML escaping; CORS/preflight; safe errors/logs; existing Contact/admin/direct-email regressions.

```powershell
npm.cmd --prefix functions/submit-enquiry test
npm.cmd --prefix functions/send-lead-email test
node --test tests/*.test.cjs
npm.cmd run build
git diff --check
```

Deployment requires a frontend rebuild/redeployment and submit-enquiry redeployment only. No send-lead-email redeployment, new environment variables/dependencies, schema, permissions or scopes are needed.

**Deploy the frontend first**, because the previous Function already accepts omitted source. Then deploy the new Function. Old cached clients that still send source will receive safe 400 responses until refreshed; do not reintroduce source acceptance as a compatibility workaround.

Create a fresh deployment archive with existing logo assets:

```powershell
tar.exe -czf functions/submit-enquiry/stacknova-submit-enquiry.tar.gz -C functions/submit-enquiry package.json package-lock.json src assets
```

Keep the existing entrypoint, runtime, build command, timeout, scopes and execute settings. Exclude env files, node_modules, tests and frontend files. No live deployment is performed by local implementation/testing. Deployed persistence, actual schema/permissions, configured origins/gateway CORS and delivered email require subsequent deployment verification.

### Local verification: 2026-10-11

All 511 tests passed: 82 submit-enquiry/Resend tests, 114 unchanged send-lead-email tests, and 315 root frontend/admin tests. The static build passed compilation, lint, type checks and generation of all eight pages. `git diff --check` passed. Admin code, direct-email Function, Appwrite configuration, dependencies and export settings have no source changes. The build regenerated `dist/`; existing generated-output deletions were present before Phase 9.

A fresh `functions/submit-enquiry/stacknova-submit-enquiry.tar.gz` contains only package.json, package-lock.json, src/ and assets/. Its inventory excludes environment files, tests and node_modules. No live rows, email sends, Console changes or deployments were performed.

## Intentional limitations

Phase 9 does not include honeypots, timing detection, rate limiting, CAPTCHA, Cloudflare Turnstile, Redis, advanced bot protection, IP tracking, fingerprinting, external anti-spam services, or persistent duplicate/rate-limit tables. A public endpoint can receive automated and repeated valid requests. Stronger anti-abuse measures can be future production-hardening options for a larger system, outside this phase.

Validation does not verify email/phone ownership. Provider acceptance does not establish inbox delivery. Separate requests can create separate leads; a timeout can occur after successful storage. Preserve the current uncertain-receipt feedback and avoid automatic retries. Phase 10 remains untouched.
