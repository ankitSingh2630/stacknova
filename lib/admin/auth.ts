import { Query, type Account, type Teams } from "appwrite";

export type AdminUser = { $id: string; name: string; email: string };
export type AdminAuthState =
  | { status: "loading" }
  | { status: "signedOut" | "forbidden" | "error"; message?: string }
  | { status: "authorized"; user: AdminUser };
type AuthConfig = { endpoint: string; projectId: string; adminTeamId: string };
type OnForbidden = (state: AdminAuthState) => boolean;
export const authMessages = {
  forbidden: "This account does not have admin access.",
  credentials: "Invalid email or password.",
  login: "Unable to sign in right now. Please try again.",
  network: "Unable to connect. Check your connection and try again.",
  verification: "Unable to verify admin access right now. Please try again.",
  configuration: "Admin sign-in is unavailable. Please contact StackNova.",
  logout: "Unable to sign out right now. Please try again.",
};

export function authConfigurationReady(config: AuthConfig) {
  try {
    const endpoint = new URL(config.endpoint);
    return ["https:", "http:"].includes(endpoint.protocol) && !endpoint.username && !endpoint.password &&
      Boolean(config.projectId.trim() && config.adminTeamId.trim());
  } catch { return false; }
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

// The provider owns state. These helpers use actual SDK methods, with injectable
// Account/Teams dependencies so tests never need a live Appwrite connection.
export function createAdminAuth({ account, teams, config }: {
  account: Pick<Account, "get" | "createEmailPasswordSession" | "deleteSession">;
  teams: Pick<Teams, "listMemberships">;
  config: AuthConfig;
}) {
  const unavailable = (): AdminAuthState => ({ status: "error", message: authMessages.configuration });
  const forbidden = async (onForbidden?: OnForbidden): Promise<AdminAuthState> => {
    const state: AdminAuthState = { status: "forbidden", message: authMessages.forbidden };
    // Publish denial before cleanup, and don't let a stale verification delete a new session.
    if (onForbidden && !onForbidden(state)) return state;
    try { await account.deleteSession({ sessionId: "current" }); }
    catch { /* Denial survives a failed session cleanup. */ }
    return state;
  };
  const verify = async (user: AdminUser, onForbidden?: OnForbidden): Promise<AdminAuthState> => {
    try {
      // SDK 28.1.0 explicitly supports userId and confirm membership filters.
      const result = await teams.listMemberships({
        teamId: config.adminTeamId,
        queries: [Query.equal("userId", user.$id), Query.equal("confirm", true), Query.limit(1)],
      });
      const accepted = result.memberships.some((membership) =>
        membership.userId === user.$id && membership.teamId === config.adminTeamId && membership.confirm === true);
      if (!accepted) return forbidden(onForbidden);
      // Do not retain the full SDK account response, preferences, or session object.
      return { status: "authorized", user: { $id: user.$id, name: user.name, email: user.email } };
    } catch (error) {
      if ([401, 403, 404].includes(Number(errorCode(error)))) return forbidden(onForbidden);
      return { status: "error", message: authMessages.verification };
    }
  };
  return {
    async restore(onForbidden?: OnForbidden): Promise<AdminAuthState> {
      if (!authConfigurationReady(config)) return unavailable();
      try { return await verify(await account.get(), onForbidden); }
      catch (error) {
        if (errorCode(error) === 401) return { status: "signedOut" };
        return { status: "error", message: authMessages.verification };
      }
    },
    async login(email: string, password: string, onForbidden?: OnForbidden): Promise<AdminAuthState> {
      if (!authConfigurationReady(config)) return unavailable();
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) return { status: "signedOut", message: "Please enter your email and password." };
      try { await account.createEmailPasswordSession({ email: trimmedEmail, password }); }
      catch (error) {
        const code = errorCode(error);
        return { status: "signedOut", message: code === 401 ? authMessages.credentials
          : code === undefined || code === 0 ? authMessages.network : authMessages.login };
      }
      // A created session alone never authorizes the workspace.
      try { return await verify(await account.get(), onForbidden); }
      catch { return { status: "error", message: authMessages.verification }; }
    },
    async logout(): Promise<{ success: boolean; message?: string }> {
      if (!authConfigurationReady(config)) return { success: false, message: authMessages.logout };
      try {
        await account.deleteSession({ sessionId: "current" });
        return { success: true };
      } catch {
        return { success: false, message: authMessages.logout };
      }
    },
  };
}
