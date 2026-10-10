# Phase 5: admin authentication and authorization

> Phase 10 handoff: follow [deployment readiness](deployment-readiness.md) and [final QA](final-qa.md) for current operational instructions and verification status. Dated results and earlier-phase scopes below are historical records; they do not establish live deployment or delivery.

## Historical Phase 5 implementation

The mock-provider and fixture references in this historical section describe Phase 5 only. The finished workspace uses LeadsProvider and real Appwrite queries, confirmed status/notes writes and permanent deletion. Appwrite team permissions are the data security boundary. See [Phase 7](phase-7-lead-management.md) and [Phase 8](phase-8-query-pagination.md).

Phase 5 replaces the fake admin login and navigation-only logout with Appwrite Account authentication and accepted Appwrite Team membership verification. Admin lead data still comes from `MockLeadsProvider` and `lib/admin/mock-data.ts`. Contact, the `submit-enquiry` Function, Resend, database schema, and lead permissions are unchanged.

## Architecture

The existing `appwrite@28.1.0` Web SDK is reused. `lib/appwrite/client.ts` exports one shared Client with Account, Teams, and TablesDB services; Phase 5 uses only Account and Teams. Missing configuration does not crash static rendering, and auth helpers reject missing/invalid configuration before requests.

`app/admin/layout.tsx` mounts one `AdminAuthProvider` for both login and workspace routes. It is the source of truth for `loading`, `signedOut`, `forbidden`, `authorized`, and safe verification/configuration error states. It keeps only the authorized user's ID, name, and email in React memory. It does not retain the session response or full account preferences, store passwords/tokens, or manually persist auth flags. Appwrite manages the session.

`lib/admin/auth.ts` implements the SDK operations and maps failures to fixed, safe messages. Dependencies are injectable for unit tests. Generation checks in the provider prevent old or unmounted verification responses from overwriting new auth state or deleting a newer session. Concurrent login/logout submissions are suppressed.

`AdminGuard` wraps the existing workspace layout **outside** `MockLeadsProvider`, the navbar, and page content. It renders workspace content only after accepted team membership is verified. The exported initial HTML shows “Checking admin session…” rather than a dashboard. Individual pages do not perform their own Account or Teams checks.

## Exact SDK calls

Login:

```ts
account.createEmailPasswordSession({ email, password })
```

The form trims email and checks required fields. Password characters are preserved; the password input is cleared after the attempt. Controls are disabled while signing in. Then `account.get()` retrieves the actual authenticated user before team authorization.

Session restoration:

```ts
account.get()
```

Accepted membership verification:

```ts
teams.listMemberships({
  teamId: appwriteConfig.adminTeamId,
  queries: [
    Query.equal("userId", user.$id),
    Query.equal("confirm", true),
    Query.limit(1),
  ],
})
```

The installed SDK's Teams declaration explicitly lists `userId` and `confirm` as supported membership filter attributes. **Filtering happens server-side through SDK-generated queries**, limiting the response to one accepted membership for the authenticated user. The helper also checks the returned `membership.userId`, `membership.teamId`, and `membership.confirm === true`. It does not authorize merely because a list is nonempty or the account can log in. Pending invitations, other users' memberships, and other teams' memberships cannot authorize access.

Logout and unauthorized-session cleanup:

```ts
account.deleteSession({ sessionId: "current" })
```

Only the current device's session is targeted. No registration, public team joining, hardcoded administrator email/domain, fake auth token, or server API key is added.

## Route and failure behavior

| Situation | Behavior |
| --- | --- |
| Initial admin entry or full browser refresh | Provider checks the existing session, then accepted team membership. Show loading until verification finishes. |
| No session on `/admin/`, `/admin/leads/`, or `/admin/lead/?id=lead-001` | Guard hides workspace content and replaces the URL with `/admin/login/`. |
| Accepted admin session | Render the existing mock workspace. Client navigation reuses the shared provider. |
| Accepted admin visits `/admin/login/` | Replace the URL with `/admin/` without showing the login form. |
| Invalid login credentials | Show “Invalid email or password.” |
| Login network failure | Show a safe connection/retry message and restore form controls. |
| Missing auth configuration | Block access and show “Admin sign-in is unavailable. Please contact StackNova.” No default project/endpoint requests are made. |
| Account/Teams verification service or network error | Block access, show safe verification feedback, and offer a session-check retry. Do not treat a transient verification error as accepted membership. |
| Authenticated account without accepted membership, or Teams API denies access | Publish `forbidden` before attempting current-session deletion. Hide all workspace content and show only the safe authorization message: “This account does not have admin access.” |
| Unauthorized cleanup fails | Keep `forbidden`; do not expose cleanup errors or allow workspace access. |
| Logout succeeds | Clear shared auth state. The workspace guard replaces the URL with `/admin/login/`. |
| Logout API rejection or network/service failure | Keep the current local identity, restore the Logout buttons, and show “Unable to sign out right now. Please try again.” Do not claim logout succeeded. A reload/session check can detect an expired session. |

Forbidden users are not automatically sent back and forth between workspace and login. The guard provides a sign-in link, and the login page does not redirect a forbidden state. Removal from the team is detected by a fresh session check on reload/direct entry; this phase does not implement continuous authorization polling. A verification error after session creation can be retried using “Check session again” without creating another session.

Login retains the existing StackNova design, password visibility toggle, labelled inputs, keyboard submission, focus styles, and mobile layout. Autocomplete is `email` and `current-password`; safe errors use an accessible live alert. Prefilled demo credentials, fake remember-session behavior, demo gateway copy, and the nonfunctional password-recovery control were removed. No recovery, MFA, OAuth, or signup flow was added.

## Manual Appwrite Console setup

Perform these steps yourself in the **existing StackNova Appwrite project**:

1. Confirm email/password authentication is enabled under Auth settings.
2. Register `localhost` as a Web platform hostname for local browser requests. Register the production hostname(s) before testing the exported production site.
3. In **Auth > Users**, create an email/password user for the administrator, or select an existing active user. Set/manage the password through Appwrite administration; never put it in a repository file or environment variable.
4. In **Auth > Teams**, create/select **StackNova Admins**. Record its team **ID**, not just its display name.
5. Add the existing user to that team's Members/Memberships list through Console administration. Verify the membership is active/accepted (`confirm: true`). Being an Appwrite Console administrator alone does not authorize this website account.
6. If using an invitation flow instead, complete its supported acceptance process and verify membership is accepted before login. A pending invitation is insufficient. Appwrite client invitations normally redirect to an app acceptance handler; **this phase does not add such a handler or a public join route**, so direct Console addition of an existing user is the recommended setup. Server-side/direct membership creation can create an active membership without an email acceptance step. See [Appwrite team invitations](https://appwrite.io/docs/products/auth/team-invites).
7. Set the public team ID in your existing `.env.local` yourself, preserving all other values:

   ```dotenv
   NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID=
   ```

   The existing `NEXT_PUBLIC_APPWRITE_ENDPOINT` and `NEXT_PUBLIC_APPWRITE_PROJECT_ID` must also target this project. Team/project IDs are public configuration, not credentials. `.env.example` already contains the empty team-ID placeholder; it was reused. No `.env.local` values were inspected, printed, or overwritten during implementation.
8. Restart the local development server after configuration changes. Rebuild the static application before deployment because `NEXT_PUBLIC_*` values are compiled into its browser assets. No Function redeployment is needed for this authentication-only phase.

Do not create an Appwrite server API key for this setup. Do not change any leads table/row permissions, add `Role.users()`, or make the table public.

## Local verification

Run from the repository root:

```powershell
node --test tests/admin-auth.test.cjs tests/admin-auth-ui.test.cjs tests/enquiry.test.cjs tests/contact.test.cjs
npm.cmd --prefix functions/submit-enquiry test
npm.cmd run build
```

The auth tests mock Account and Teams calls and execute the actual helper/component handlers. They cover login ordering, query filtering, accepted/pending/mismatched membership, safe errors, missing configuration, restoration, revoked membership, cleanup failure/order, stale requests, protected-content loading, direct-route redirects, authorized login redirect, duplicate submission, password clearing, logout success/failure, and preservation of mock data and static architecture. Existing enquiry and Function/Resend regression tests still run without live provider requests.

Implementation verification on 2026-10-09: **39 auth tests, nine enquiry/Contact tests, and 42 Function/Resend tests passed (90 total)**. The final `npm.cmd run build` passed, including lint/type checks and generation of all eight static pages. Exported HTML exists for `/admin/`, `/admin/login/`, `/admin/leads/`, and `/admin/lead/`; each begins with the session-checking state. A mock-only visual preview of the actual login component was reviewed at desktop and 375-pixel mobile widths, without contacting Appwrite. The static build regenerated `dist/`; this verification does not establish live authentication.

After manual setup, test these in a browser:

- Signed out: open `/admin/`, `/admin/leads/`, and `/admin/lead/?id=lead-001` directly; verify login redirection without dashboard flash.
- Accepted admin: sign in, visit each workspace route, and refresh each one; verify session restoration and mock leads. `lead-001` is not an existing fixture ID, so the authorized detail page may display the existing “Lead unavailable” state. Use a lead link from the mock list for populated details.
- Accepted admin: visit `/admin/login/`; verify redirection to `/admin/`.
- Non-admin/pending invitation: sign in; verify only the safe authorization denial appears and no workspace is displayed. Remove an existing test user's membership and reload to check revocation behavior.
- Logout: verify current-session removal, login redirection, and denial on a refreshed workspace URL. Simulate a network failure to verify safe retry feedback without false logout success.
- Confirm Contact still submits through the existing Function and server-side Resend flow. Do not use mock admin leads as evidence of real enquiry storage.

**Live Appwrite login, team verification, session persistence, and logout remain unverified until manual Console setup and real browser testing.** Passing unit tests/build does not prove a live account can authenticate or that platform/cookie configuration is correct.

## Static export and Phase 6 boundary

The app remains Next.js App Router with `output: 'export'`. Authentication is entirely client-side. No middleware, server auth, Next.js API routes, route handlers, server actions, SSR runtime, or Next-managed auth cookies are introduced. Login and all workspace routes remain statically exported.

The client-side guard prevents unauthorized UI access, **but it is not the security boundary for real lead data**. Static files and browser code are public, and this phase's mock data is bundled in the site. Phase 6 will configure Appwrite team-based permissions using `Role.team(adminTeamId)` and operation-specific permissions before integrating real lead reads/writes. Appwrite must enforce those permissions on every request, including after team removal. None of those data permissions or integrations are implemented here.

Stop after Phase 5.

## Official references

- [Appwrite email/password login](https://appwrite.io/docs/products/auth/email-password)
- [Appwrite Teams](https://appwrite.io/docs/products/auth/teams)
- [Appwrite team invitations and acceptance](https://appwrite.io/docs/products/auth/team-invites)
- [Appwrite Account Web API](https://appwrite.io/docs/references/cloud/client-web/account)
- [Appwrite Teams Web API](https://appwrite.io/docs/references/cloud/client-web/teams)
