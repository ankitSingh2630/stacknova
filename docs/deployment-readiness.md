# Deployment readiness

This is the current operational handoff for the completed StackNova application. Earlier phase documents retain useful implementation history; this checklist and [Appwrite setup](appwrite-setup.md) describe current configuration. [Final QA](final-qa.md) records local evidence separately from manual/live verification.

**Phase 10 does not deploy anything.** Frontend metadata changed and requires a subsequent frontend deployment. Neither Function runtime changed in Phase 10, so neither requires a Phase 10 redeployment. The still-pending Phase 9 submit-enquiry deployment and its live checks remain separate outstanding requirements.

## Environment and runtime configuration

Never publish secret values. Do not overwrite an existing local env file. Use tracked empty examples for new setups. NEXT_PUBLIC values are browser-safe configuration compiled into static assets; restart development or rebuild after changes.

| Frontend variable | Purpose | Classification |
| --- | --- | --- |
| NEXT_PUBLIC_APPWRITE_ENDPOINT | Appwrite API endpoint including /v1 | Public configuration |
| NEXT_PUBLIC_APPWRITE_PROJECT_ID | Existing project identifier | Public configuration |
| NEXT_PUBLIC_APPWRITE_DATABASE_ID | Existing database identifier | Public configuration |
| NEXT_PUBLIC_APPWRITE_LEADS_TABLE_ID | Existing leads table identifier | Public configuration |
| NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID | Accepted administrator team identifier | Public configuration |
| NEXT_PUBLIC_ENQUIRY_FUNCTION_URL | Public HTTPS submit-enquiry Function domain | Public configuration |
| NEXT_PUBLIC_APPWRITE_SEND_LEAD_EMAIL_FUNCTION_ID | Authenticated direct-email Function identifier | Public configuration |

Optional `ASSET_PREFIX` is public frontend build configuration read by next.config.mjs. Domain-root hosting is the current workflow; setting this variable alone does not establish subfolder route/public-asset support. Do not change routing as part of this handoff.

Configure the following manually in **Function-specific Appwrite Variables**, never frontend env files:

| Function | Variable | Classification / purpose |
| --- | --- | --- |
| submit-enquiry | DATABASE_ID | Backend-only configured database target |
| submit-enquiry | LEADS_TABLE_ID | Backend-only configured table target |
| submit-enquiry | ALLOWED_ORIGINS | Backend-only exact approved browser origins |
| submit-enquiry | RESEND_FROM_EMAIL | Backend-only verified bare sender address |
| submit-enquiry | STACKNOVA_LEADS_EMAIL | Backend-only bare internal notification recipient |
| submit-enquiry | RESEND_API_KEY | Backend secret |
| send-lead-email | DATABASE_ID | Backend-only configured database target |
| send-lead-email | LEADS_TABLE_ID | Backend-only configured table target |
| send-lead-email | RESEND_FROM_EMAIL | Backend-only verified bare sender address |
| send-lead-email | RESEND_API_KEY | Backend secret |

No ALLOWED_ORIGINS variable is used by send-lead-email; it is invoked through the authenticated browser Appwrite SDK. No manually configured Appwrite API key is needed.

| Appwrite-supplied runtime context | Classification | Action |
| --- | --- | --- |
| APPWRITE_FUNCTION_API_ENDPOINT | Backend runtime configuration | Automatically supplied; do not add manually |
| APPWRITE_FUNCTION_PROJECT_ID | Backend runtime configuration | Automatically supplied; do not add manually |
| Request x-appwrite-key | Ephemeral backend secret | Automatically supplied; never log/copy into frontend |
| Request x-appwrite-user-id | Backend invoking-user context | Automatically supplied for authenticated execution; required by direct-email handler |

The handlers read their request text from req.bodyText. Runtime headers are not user-editable configuration fields in the Contact/admin request bodies. Preserve Phase 9 validation, fixed configured targets, generic errors and safe logging.

## Manual Appwrite configuration checklist

All live configuration checks are **PENDING / NOT YET VERIFIED** by Phase 10. This document does not authorize automatic Console changes.

| Check | Expected state | Status |
| --- | --- | --- |
| Project and identifiers | Frontend and both Functions use the intended existing project/database/table | PENDING |
| Browser platforms | Localhost and intended production hostnames registered as appropriate | PENDING |
| Authentication | Email/password enabled; administrator account active | PENDING |
| Team membership | StackNova Admins membership accepted/confirmed, not merely invited | PENDING |
| Lead columns/capacities | Existing columns meet current contracts; no speculative schema changes | PENDING |
| Status enum | New, Contacted, In Progress, Converted, Closed | PENDING |
| Team table grants | Read/Update/Delete enabled; Create disabled | PENDING |
| Public table/row grants | No broad Any/Guests/Users or public lead access | PENDING |
| Legacy compatibility | Keep deletedAt column/index, type support, active queries and guards | PENDING |
| Existing query indexes | Verify status, service and deletedAt availability | PENDING |
| submit-enquiry | Execute Any; only rows.write; correct variables and active deployment | PENDING |
| send-lead-email | Execute StackNova Admins only; only rows.read; correct variables and active deployment | PENDING |
| Function triggers/timeouts | Events/schedules empty; existing 30-second timeout retained | PENDING |
| Resend setup | Sender domain verified and correct operational inboxes configured | PENDING |

The browser guard is not the database security boundary. Table grants apply to rows; empty per-row permissions do not override table grants. Do not change Row Security or row permissions. rows.write is broader than create-only access; the public Function constrains operations to its configured target and single createRow call.

New deletion is permanent `deleteRow()`. Historical populated deletedAt rows stay filtered and guarded. Do not clear their markers or remove compatibility/schema; future migration is a separately approved decision.

## Function packages

Both packages use Node.js >=22, entrypoint `src/main.js`, and build command `npm ci --omit=dev --ignore-scripts`. Git-deployment roots are the respective Function directories.

Required archive contents only:

```text
package.json
package-lock.json
src/
assets/
```

The existing assets/stacknova-logo.png is required for CID logo attachments. Exclude node_modules, test/, .env files, docs, frontend code and archives nested inside archives. Package each Function independently and inspect the inventory before upload:

```powershell
tar.exe -czf "$env:TEMP/stacknova-submit-enquiry.tar.gz" -C functions/submit-enquiry package.json package-lock.json src assets
tar.exe -tf "$env:TEMP/stacknova-submit-enquiry.tar.gz"
tar.exe -czf "$env:TEMP/stacknova-send-lead-email.tar.gz" -C functions/send-lead-email package.json package-lock.json src assets
tar.exe -tf "$env:TEMP/stacknova-send-lead-email.tar.gz"
```

These are packaging instructions, not a Phase 10 requirement to redeploy both Functions. When deployment is actually required, upload the correct fresh archive, retain entrypoint/build/runtime settings, activate the successful deployment, then perform live checks. A source archive being present does not prove it is deployed.

## Frontend hosting checklist

1. Stop any development process using the build output; install locked dependencies with npm ci and configure the seven public variables.
2. Run npm run build (npm.cmd on Windows); require compilation, lint, types and static export to pass.
3. Verify dist/index.html, all four admin routes, 404 output, referenced assets, .htaccess and absence of private runtime files/secrets. Do not manually edit dist.
4. Review tracked generated changes, including removed/replaced hashes. Do not delete dist from the repository.
5. On the existing domain-root cPanel workflow, upload the **contents** of dist into public_html, retaining hierarchy and the hidden .htaccess file. Do not upload source, node_modules, env files or Function archives.
6. Serve through a valid HTTPS certificate. Confirm HTTPS/non-www redirects, compression/caching where supported, branded 404, images/fonts, anchor navigation and direct /admin/... reloads.
7. Check public/admin behavior with intended Appwrite platforms and production origins; record results in final-qa.md.

trailingSlash creates directory index pages. Lead Details remains `/admin/lead/?id=<lead-id>`. No Next.js server, `next start`, separate `next export`, API route, dynamic [id], Server Action or middleware backend is needed. Use the existing npm run preview for local exported output; a homepage fallback is not proof that each admin route exists.

For the pending Phase 9 rollout, deploy the Contact frontend that omits the source request property first, then the hardened submit-enquiry Function. Old cached clients still sending source will fail safely until refreshed. Do not restore client-source acceptance. Phase 10 itself requires only frontend redeployment for metadata; previous live deployments are not assumed complete.

## Git handoff

The admin-email deployment archive has been removed from tracking while retaining its ignored local copy. The public-enquiry archive is also ignored/untracked. Root ignore rules preserve .env.example files while protecting actual env files; each Function ignores node_modules and its deployment archives. Keep reference screenshots/brand masters: they are intentional documentation assets, not runtime deployment files.

Review before staging and again before committing:

```powershell
git status --short
git diff --check
git diff --stat
git diff --cached --name-status
git diff --cached
git ls-files '*env*' '*node_modules*' '*.tar.gz' '*.zip'
```

Only approved source/docs and verified dist output should be added. Review actual file contents for secrets without pasting values into reports. Check for temporary files, unexpected screenshots, a comma-named file and generated caches outside dist; do not remove intentional references or ignored local working files.

After review, a scoped staging command is:

```powershell
git add README.md app/layout.tsx docs/ functions/send-lead-email/.gitignore dist/
git diff --cached --check
git diff --cached --name-status
git diff --cached
```

The approved archive removal is already staged; inspect it with the rest. No other files are automatically staged, committed or pushed by Phase 10. Suggested commit message: `docs: finalize StackNova QA and deployment handoff`. Verify the intended branch/remote before any later push; no deployment, commit or push is performed here.
