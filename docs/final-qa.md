# Final QA

Phase 10 finalizes documentation and deployment readiness. PASS means evidence was obtained; FAIL means an observed failure; PENDING / NOT YET VERIFIED means the check has not been performed. A documented procedure is not a passed test. Use disposable, specifically identified test leads and inboxes for any later authorized live mutations/sends.

## Automated and repository verification

Fresh Phase 10 verification completed on 2026-10-11: **511 tests passed, zero failures**. Commands were rerun for this phase; these are not copied Phase 9 results. No live database operations, real emails, Appwrite configuration changes or deployment were performed.

| Check | Status | Evidence |
| --- | --- | --- |
| Root frontend/admin tests | PASS | Fresh node --test tests/*.test.cjs: 315 passed, 0 failed |
| submit-enquiry request/email tests | PASS | Fresh npm.cmd --prefix functions/submit-enquiry test: 82 passed, 0 failed |
| send-lead-email tests | PASS | Fresh npm.cmd --prefix functions/send-lead-email test: 114 passed, 0 failed |
| Production build | PASS | Fresh npm.cmd run build: compilation, lint, types and 8/8 generated static pages passed |
| Whitespace/diff checks | PASS | git diff --check and git diff --cached --check returned success |
| Static pages/assets/metadata | PASS | All public/admin/404 files; session-checking admin HTML; 480x160 logo and summary metadata; zero missing local asset references |
| Secret/artifact regression | PASS | No detected backend-secret markers/env/Function files in export; tracked/staged inventory reviewed without printing secret values |
| Function package inventory/source match | PASS | Both archives contain exactly six runtime files under package files/src/assets; byte-for-byte match with current source |
| Legacy guards/runtime scope preservation | PASS | Admin/lib/Function runtime, dependencies and next.config unchanged; existing security/legacy regression suites passed |
| Archive tracking/local preservation | PASS | Admin archive untracked with git rm --cached; both local archives retained and ignored; neither remains tracked |

Run from the root, with locked dependencies installed in the root and both Function packages:

```powershell
node --test tests/*.test.cjs
npm.cmd --prefix functions/submit-enquiry test
npm.cmd --prefix functions/send-lead-email test
npm.cmd run build
git diff --check
```

There is no root npm test script. The submit-enquiry package's node --test script includes main.test.js and email.test.js. Automated tests inject/stub Appwrite/Resend or intercept their SDK requests; no live database write, deletion, enquiry or email send is performed.

## Export and repository evidence

The build reported **8 generated pages**. The emitted export contains **49 files**, including **7 HTML files**: the public page, four admin pages and both 404 representations. This distinguishes the build counter from the HTML-file count.

Only the build regenerated dist. Its two previous build-ID manifest files were removed and two fresh manifest files emitted; unchanged content hashes for JS/CSS remain valid. Local HTML asset references resolve; public/.htaccess matches the emitted copy. No /og.png reference remains in current layout/export, and generated Open Graph width/height match public/logo.png (480x160). Social crawler rendering and deployed hosting behavior remain manual PENDING items below.

The archive deletion is the only staged change. Approved source/docs and generated dist changes remain unstaged for user review. No populated env files, node_modules, deployment archives, comma-named files or unexpected screenshots remain in the tracked/staged inventory. Existing docs design screenshots and brand masters are intentional references. Historical dated verification paragraphs were compared with HEAD and are unchanged. Local Markdown file links resolve.

Function runtime, templates, assets, dependencies, Appwrite client/admin modules and static-export settings were not modified. The only runtime-source edit is existing social metadata in app/layout.tsx. No new features/dependencies or UI redesign were introduced.

## Manual admin QA

Every row below is **PENDING**. No authenticated/live browser scenario is claimed complete by the local tests or build.

| ID | Scenario | Expected result | Status |
| --- | --- | --- | --- |
| A01 | Valid accepted admin login | Authorized workspace; password cleared | PENDING |
| A02 | Invalid credentials | Safe error, controls restored | PENDING |
| A03 | Non-team/pending member login | Workspace denied; no private data | PENDING |
| A04 | Logout and refreshed workspace | Current session removed; login redirect | PENDING |
| A05 | Signed-out direct admin route | Session check then redirect without private content flash | PENDING |
| A06 | Authorized route refresh/login-page entry | Session restored; login page redirects to dashboard | PENDING |
| A07 | Dashboard counts | Full active totals and five status counts, independent of list filters | PENDING |
| A08 | Recent Leads and removed area | At most five newest active rows; Open Pipeline absent | PENDING |
| A09 | Search name/email/phone/company | Correct server results after debounce; compare case behavior explicitly | PENDING |
| A10 | Status filter | Matching rows and authoritative count | PENDING |
| A11 | Service filter | Existing service choices; matching results | PENDING |
| A12 | Today/Last 7 Days/All Time | India-local inclusive start/exclusive end, combined filters work | PENDING |
| A13 | Forward/back/numbered pagination | Five-row pages, correct range/total, criteria reset page | PENDING |
| A14 | Empty and no-match lists | Appropriate unfiltered/filtered messages | PENDING |
| A15 | Loading/update/read failure | Accessible feedback, previous results identified, safe retry | PENDING |
| A16 | Valid direct detail ID | Correct real lead and query-string URL | PENDING |
| A17 | Missing/invalid/unknown/legacy archived ID | Safe unavailable state; no invalid fetch/send | PENDING |
| A18 | Status update and refresh | Confirmed persistence; list/dashboard reconcile | PENDING |
| A19 | Successive private notes | Append confirmed text; draft preserved on failure | PENDING |
| A20 | Delete cancel/Escape | Permanent warning; cancel without request; focus restored | PENDING |
| A21 | Confirm permanent deletion of disposable row | One deleteRow; actual row absent; pending controls disabled | PENDING |
| A22 | Post-delete navigation/reconciliation | Leads redirect, success notice, counts and final-page correction | PENDING |
| A23 | Direct email primary To | Noneditable UI; recipient resolved from database lead | PENDING |
| A24 | Custom subject/multiline message | Valid text sent with existing branding | PENDING |
| A25 | Optional CC | Intended copy inboxes receive message | PENDING |
| A26 | Optional BCC privacy | Hidden recipients receive message; absent from other recipients/body | PENDING |
| A27 | Duplicate/case/primary-To copies | Deduplication, BCC precedence, primary removed from copy lists | PENDING |
| A28 | Email validation | Invalid types/addresses/limits/controls fail without send | PENDING |
| A29 | Email success/error feedback | Confirmed success clears drafts; safe error retains them; pending lock | PENDING |
| A30 | Session/access errors | Appropriate denial/recheck; no raw provider errors or retry loop | PENDING |
| A31 | Desktop/tablet/mobile admin | Readable layouts, no overflow, working controls | PENDING |
| A32 | Keyboard/focus/labels | Login, filters, notes, dialog and email accessible | PENDING |

## Manual public-site QA

| ID | Scenario | Expected result | Status |
| --- | --- | --- | --- |
| P01 | Navbar/anchor/footer navigation | Correct sections; mobile menu closes/unlocks scrolling | PENDING |
| P02 | Desktop/tablet/mobile layout | No clipping/overflow; logo/fonts/images render | PENDING |
| P03 | Contact required/invalid fields | Clear feedback and first invalid field focus | PENDING |
| P04 | Budget-only or combined overflow | Required project text; 4,000 combined-character limit without truncation | PENDING |
| P05 | Real approved enquiry | Exactly one private lead with server-owned source/New status | PENDING |
| P06 | Submission failure/timeout | Safe feedback; values retained; uncertain receipt explained | PENDING |
| P07 | Rapid clicks/Enter while pending | Single pending request; disabled controls | PENDING |
| P08 | Mobile form/keyboard | Labels, field limits, focus and status readable | PENDING |
| P09 | External contact/social links | Intended destinations and correct business contact information | PENDING |
| P10 | Social metadata/404/deep URLs | Existing logo preview, branded 404, admin directory routes reload | PENDING |

## Live email checklist

| ID | Scenario | Expected result | Status |
| --- | --- | --- | --- |
| E01 | Public lead storage before sends | Lead exists even if a best-effort email fails | PENDING |
| E02 | Customer confirmation received | Current light template and acknowledgement wording | PENDING |
| E03 | Admin notification received | Correct inbox, all public lead details, New status | PENDING |
| E04 | Reply to admin notification | Targets validated customer email | PENDING |
| E05 | All three templates and CID logo | Branded light card and inline logo in desktop/mobile clients | PENDING |
| E06 | HTML-like/multiline text and plaintext | Meaningful escaped content and readable plaintext | PENDING |
| E07 | Direct-message delivered headers | Server-resolved To, custom subject, correct configured sender; replies to sender | PENDING |
| E08 | CC/BCC and duplicate delivery | Correct delivery, BCC privacy and cleanup | PENDING |

Check actual inboxes and delivery status; provider acceptance alone does not establish delivery. Do not use real customer enquiries as disposable deletion fixtures. Local tests do not complete these rows.

## Security and deployment checks

Automated suites must keep malformed JSON/structures, unknown fields including source, non-string text, blank required values, all size limits, mailbox/phone/service rules, raw controls, safe HTML/plaintext, generic errors, minimal logs and exact CORS/OPTIONS intact. Every rejected public request must have zero writes, zero sends and no Resend initialization. Admin Create stays disabled; permanent deletion and legacy guards are preserved.

| Live check | Expected result | Status |
| --- | --- | --- |
| Deployed schema capacities | Meet documented field contracts; no Phase 10 schema change | PENDING |
| Actual active Function deployments | Correct source/assets/entrypoints; Phase 9 public Function rollout verified | PENDING |
| Actual team/table/Function permissions | Read/Update/Delete, no Create/public table access; correct Execute/scopes | PENDING |
| Production CORS and gateway | Exact configured origins; rejected origins lack permissive headers; OPTIONS works | PENDING |
| Auth/browser platform/session behavior | Intended production/local browser access and team denial | PENDING |
| Live enquiry persistence | Server values, private row, safe failure behavior | PENDING |
| Hosting HTTPS/cache/routes/assets | Correct domain-root static deployment; no stale or missing assets | PENDING |
| Search case/order/index compatibility | Actual observed behavior recorded; no speculative schema workaround | PENDING |

CORS is not authentication; direct clients can supply an approved Origin. Automated/repeated valid requests remain possible. Honeypots, timing detection, rate limiting, CAPTCHA, Turnstile, Redis, IP tracking, fingerprinting, duplicate tables and advanced anti-spam remain excluded. No product features, Appwrite changes, deployment or commit are added by Phase 10.

For each later manual result, replace PENDING with PASS or FAIL only after execution and record date, environment and concise redacted evidence. Do not record credentials or full customer payloads. Unperformed live checks remain explicit handoff items, even when every local automated check passes.
