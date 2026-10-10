# StackNova

## Overview

StackNova combines a responsive company website with public project enquiries and a private admin workspace for managing leads. The frontend is a static Next.js export; Appwrite supplies authentication, private data access and Functions, while Resend sends branded emails.

## Tech Stack

- Frontend: Next.js 14 App Router, React, TypeScript, Tailwind CSS, Framer Motion.
- Backend/services: Appwrite Account and Teams, TablesDB, Appwrite Functions, Resend.
- Deployment: static `dist/` output for the existing Apache/LiteSpeed cPanel hosting workflow; Functions deploy separately to Appwrite.

## Main Features

- Public: responsive company website, anchor navigation, validated Contact enquiries and customer confirmation emails.
- Admin: Appwrite login and accepted StackNova Admins membership, dashboard totals and up to five recent leads, real server search/status/service/date filters, five-row pagination, status updates, private notes, confirmed permanent deletion, and direct email with optional CC/BCC.
- Email: matching branded light HTML templates, packaged inline logos, plaintext alternatives and an internal new-lead notification with customer Reply-To.

New deletions permanently remove rows with `deleteRow()`. Legacy `deletedAt` filters remain temporarily for historical archived rows; migration is a separate decision.

## Architecture

```text
Static Next.js frontend
  |-- Admin session --> Appwrite Account / Teams
  |-- Authorized admin --> private TablesDB reads / updates / deletes
  |-- Contact --> public submit-enquiry Function
  |                |-- private TablesDB create
  |                `-- Resend customer confirmation + admin notification
  `-- Admin Send Email --> team-only send-lead-email Function
                            |-- TablesDB read of authoritative recipient
                            `-- Resend direct email + optional CC/BCC
```

There is no Next.js runtime server, SSR, API route or Server Action. Lead Details uses `/admin/lead/?id=<lead-id>`, rather than a dynamic route. The browser guard protects workspace presentation; Appwrite permissions enforce data access.

## Local Development

Use Node.js 22 or newer to match the Function packages. Install locked frontend dependencies, copy the empty example to a new local environment file, and fill in your own public configuration:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Do not overwrite an existing `.env.local`. On Windows, use `Copy-Item .env.example .env.local` only for a new setup; `npm.cmd` avoids PowerShell execution-policy issues with `npm.ps1`. Development runs at `http://localhost:3000`.

For Function tests, install each package separately:

```sh
npm ci --prefix functions/submit-enquiry --ignore-scripts
npm ci --prefix functions/send-lead-email --ignore-scripts
```

## Environment Variables

Frontend/build configuration is public:

```dotenv
NEXT_PUBLIC_APPWRITE_ENDPOINT=
NEXT_PUBLIC_APPWRITE_PROJECT_ID=
NEXT_PUBLIC_APPWRITE_DATABASE_ID=
NEXT_PUBLIC_APPWRITE_LEADS_TABLE_ID=
NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID=
NEXT_PUBLIC_ENQUIRY_FUNCTION_URL=
NEXT_PUBLIC_APPWRITE_SEND_LEAD_EMAIL_FUNCTION_ID=
```

Configure Functions separately in Appwrite Variables:

| Function | Backend-only configuration | Secret |
| --- | --- | --- |
| submit-enquiry | DATABASE_ID, LEADS_TABLE_ID, ALLOWED_ORIGINS, RESEND_FROM_EMAIL, STACKNOVA_LEADS_EMAIL | RESEND_API_KEY |
| send-lead-email | DATABASE_ID, LEADS_TABLE_ID, RESEND_FROM_EMAIL | RESEND_API_KEY |

Appwrite supplies Function runtime endpoint/project variables and the execution key automatically; do not manually create them. Never place privileged credentials in `NEXT_PUBLIC_*` or frontend files. Public values are compiled into the build, so changes require a rebuild. See [environment and runtime configuration](docs/deployment-readiness.md#environment-and-runtime-configuration).

## Build

```sh
npm run build
npm run preview
```

The build generates static HTML/CSS/JS in `dist/`, which this repository intentionally tracks. `generate` is an existing alias for the same build. Preview serves `dist/` on port 3000. Do not use `next start` or append `next export`; `output: 'export'` handles the export. Stop development before building, then restart it if needed because development/build artifacts share the configured output location.

## Testing

Run the actual existing commands from the repository root:

```sh
node --test tests/*.test.cjs
npm --prefix functions/submit-enquiry test
npm --prefix functions/send-lead-email test
npm run build
git diff --check
```

The root uses Node's test runner directly; there is no root `npm test` script. The submit-enquiry suite includes email regressions. Tests use artificial data and mocked/intercepted Appwrite/Resend requests; they create no live rows and send no real emails. Build success does not prove production permissions, persistence or email delivery. See [final QA](docs/final-qa.md).

## Deployment

Build with the correct public configuration, then upload the **contents** of `dist/`, including `.htaccess`, to the existing domain-root `public_html` hosting location. Verify HTTPS, redirects, assets and direct admin-route reloads. Subfolder hosting is not established by `ASSET_PREFIX` alone.

Each Appwrite Function has its own `src/main.js` entrypoint and deployment package containing only package files, `src/` and `assets/`. Do not commit deployment archives. See the [deployment checklist](docs/deployment-readiness.md).

Phase 10 requires frontend redeployment for the corrected metadata, but no Function redeployment. The still-pending Phase 9 submit-enquiry deployment is a separate requirement; no live deployment or delivery is claimed by local QA.

## Security

Public requests are validated inside the Function for body structure, types, supported fields, field/body sizes, raw controls, mailbox/phone format and service choices. Source/status are server-owned. Dynamic HTML is escaped, errors are generic, logs omit sensitive/provider text, and secrets remain backend-only. Admin data access uses team permissions; public table grants and admin Create remain disabled.

CORS matches explicitly configured origins and supports restricted preflight. It controls browser behavior, not endpoint authentication: direct clients can supply an approved Origin. Automated/repeated valid enquiries remain possible. Rate limiting, honeypots, CAPTCHA, Turnstile, IP tracking and fingerprinting are intentionally excluded. See [Phase 9 security](docs/phase-9-security-hardening.md).

## Documentation

- [Appwrite setup](docs/appwrite-setup.md): current project, schema and permission checklist.
- [Deployment readiness](docs/deployment-readiness.md): environments, packaging, hosting and Git handoff.
- [Final QA](docs/final-qa.md): automated evidence and pending manual/live checks.
- [Public enquiries](docs/phase-3-enquiry.md) and [enquiry emails](docs/phase-4-email.md).
- [Admin authentication](docs/phase-5-admin-auth.md), [historical read integration](docs/phase-6-real-leads.md), [lead management](docs/phase-7-lead-management.md), and [server queries/pagination](docs/phase-8-query-pagination.md).
- [Admin email and CC/BCC](docs/admin-lead-email.md).
- [Security hardening](docs/phase-9-security-hardening.md).

Earlier-phase implementation sections and dated results are historical records. Follow current operational checklists for deployment; use historical design references for provenance rather than current runtime specifications.
