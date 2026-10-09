const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { Query } = require("appwrite");
const compiled = ts.transpileModule(readFileSync("lib/admin/auth.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, URL, require: () => ({ Query }) };
vm.runInNewContext(compiled, sandbox);
const { createAdminAuth, authMessages } = sandbox.exports;
const config = { endpoint: "https://appwrite-test.invalid/v1", projectId: "test-project", adminTeamId: "test-admin-team" };
const user = { $id: "user-1", name: "Test Admin", email: "admin@example.com", prefs: { private: "discard" } };
const membership = { userId: user.$id, teamId: config.adminTeamId, confirm: true };
const plain = (value) => JSON.parse(JSON.stringify(value));
const failure = (code) => Object.assign(new Error("private Appwrite details / credentials / team-id"), { code });
function fixture({ memberships = [membership], loginError, getError, teamError, deleteError, options = config, onDelete } = {}) {
  const calls = [];
  const account = {
    createEmailPasswordSession: async (params) => { calls.push(["login", plain(params)]); if (loginError) throw loginError; return { secret: "never-retain-session" }; },
    get: async () => { calls.push(["get"]); if (getError) throw getError; return user; },
    deleteSession: async (params) => { calls.push(["delete", plain(params)]); if (onDelete) await onDelete(); if (deleteError) throw deleteError; return {}; },
  };
  const teams = { listMemberships: async (params) => { calls.push(["memberships", plain(params)]); if (teamError) throw teamError; return { memberships }; } };
  return { auth: createAdminAuth({ account, teams, config: options }), calls };
}

test("valid login trims email, preserves password, fetches identity, and verifies accepted team membership", async () => {
  const { auth, calls } = fixture();
  const result = await auth.login(" admin@example.com ", " test-password ");
  assert.deepEqual(plain(result), { status: "authorized", user: { $id: user.$id, name: user.name, email: user.email } });
  assert.deepEqual(calls.map(([name]) => name), ["login", "get", "memberships"]);
  assert.deepEqual(calls[0][1], { email: "admin@example.com", password: " test-password " });
  assert.equal(calls[2][1].teamId, config.adminTeamId);
  const queries = calls[2][1].queries.map(JSON.parse);
  assert.deepEqual(queries, [
    { method: "equal", attribute: "userId", values: [user.$id] },
    { method: "equal", attribute: "confirm", values: [true] },
    { method: "limit", values: [1] },
  ]);
  assert.ok(!JSON.stringify(result).includes("never-retain-session"));
  assert.ok(!JSON.stringify(result).includes("discard"));
});
test("invalid credentials return safe feedback without user/team checks", async () => {
  const { auth, calls } = fixture({ loginError: failure(401) });
  assert.deepEqual(plain(await auth.login("admin@example.com", "wrong-password")), { status: "signedOut", message: authMessages.credentials });
  assert.equal(calls.length, 1);
});
test("login network failures and service failures are mapped to safe messages", async () => {
  for (const [error, message] of [[new TypeError("private network URL"), authMessages.network], [failure(0), authMessages.network], [failure(500), authMessages.login]]) {
    const { auth } = fixture({ loginError: error });
    const result = await auth.login("admin@example.com", "test-password");
    assert.equal(result.message, message);
    assert.ok(!JSON.stringify(result).includes(error.message));
  }
});
test("blank required fields never call Appwrite", async () => {
  const { auth, calls } = fixture();
  for (const [email, password] of [[" ", "test-password"], ["admin@example.com", ""]]) {
    assert.equal((await auth.login(email, password)).status, "signedOut");
  }
  assert.equal(calls.length, 0);
});
for (const [label, memberships] of [
  ["absent", []], ["pending", [{ ...membership, confirm: false }]],
  ["another user", [{ ...membership, userId: "other-user" }]],
  ["another team", [{ ...membership, teamId: "other-team" }]],
]) {
  test(`${label} membership denies login and deletes only the current session`, async () => {
    const { auth, calls } = fixture({ memberships });
    assert.deepEqual(plain(await auth.login("admin@example.com", "test-password")), { status: "forbidden", message: authMessages.forbidden });
    assert.deepEqual(calls.at(-1), ["delete", { sessionId: "current" }]);
  });
}
test("forbidden state is published before cleanup and survives cleanup failure", async () => {
  const events = [];
  const { auth } = fixture({ memberships: [], deleteError: failure(500), onDelete: () => events.push("cleanup") });
  const result = await auth.login("admin@example.com", "test-password", (state) => { events.push(state.status); return true; });
  assert.deepEqual(events, ["forbidden", "cleanup"]);
  assert.equal(result.status, "forbidden");
  assert.equal(result.message, authMessages.forbidden);
});
test("stale verification cannot delete the current session", async () => {
  const { auth, calls } = fixture({ memberships: [] });
  assert.equal((await auth.restore(() => false)).status, "forbidden");
  assert.ok(!calls.some(([operation]) => operation === "delete"));
});
test("accepted existing session restores identity without creating another session", async () => {
  const { auth, calls } = fixture();
  assert.equal((await auth.restore()).status, "authorized");
  assert.deepEqual(calls.map(([name]) => name), ["get", "memberships"]);
});
test("no current session restores signedOut without team calls", async () => {
  const { auth, calls } = fixture({ getError: failure(401) });
  assert.deepEqual(plain(await auth.restore()), { status: "signedOut" });
  assert.deepEqual(calls, [["get"]]);
});
test("existing session removed from team is forbidden even if session cleanup fails", async () => {
  const { auth } = fixture({ memberships: [], deleteError: failure(500) });
  assert.deepEqual(plain(await auth.restore()), { status: "forbidden", message: authMessages.forbidden });
});
test("team API access denials fail closed", async () => {
  for (const code of [401, 403, 404]) {
    const { auth, calls } = fixture({ teamError: failure(code) });
    assert.equal((await auth.restore()).status, "forbidden");
    assert.equal(calls.at(-1)[0], "delete");
  }
});
test("temporary Account/Teams verification failure blocks access without deleting a session", async () => {
  for (const options of [{ getError: failure(500) }, { teamError: failure(500) }, { teamError: new TypeError("private network URL") }]) {
    const { auth, calls } = fixture(options);
    assert.deepEqual(plain(await auth.restore()), { status: "error", message: authMessages.verification });
    assert.ok(!calls.some(([name]) => name === "delete"));
  }
});
test("successful session creation followed by Account failure cannot authorize", async () => {
  const { auth } = fixture({ getError: failure(500) });
  assert.equal((await auth.login("admin@example.com", "test-password")).status, "error");
});
test("missing or invalid auth configuration fails safely before any API calls", async () => {
  for (const change of [{ endpoint: "" }, { endpoint: "not-a-url" }, { endpoint: "https://name:secret@example.com/v1" }, { projectId: " " }, { adminTeamId: "" }]) {
    const { auth, calls } = fixture({ options: { ...config, ...change } });
    for (const result of [await auth.restore(), await auth.login("admin@example.com", "test-password")]) {
      assert.equal(result.status, "error");
      assert.equal(result.message, authMessages.configuration);
    }
    assert.equal((await auth.logout()).success, false);
    assert.equal(calls.length, 0);
  }
});
test("logout deletes only the current session", async () => {
  const { auth, calls } = fixture();
  assert.deepEqual(plain(await auth.logout()), { success: true });
  assert.deepEqual(calls, [["delete", { sessionId: "current" }]]);
});
test("logout network failure reports failure with safe retry feedback", async () => {
  const { auth } = fixture({ deleteError: failure(500) });
  assert.deepEqual(plain(await auth.logout()), { success: false, message: authMessages.logout });
});
test("logout API rejection is not reported as successful logout", async () => {
  const { auth } = fixture({ deleteError: failure(401) });
  assert.equal((await auth.logout()).success, false);
});
