const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const messages = { forbidden: "This account does not have admin access.", login: "Unable to sign in right now. Please try again.", verification: "Unable to verify admin access right now. Please try again.", logout: "Unable to sign out right now. Please try again." };
const authorized = { status: "authorized", user: { $id: "test-user", name: "Test Admin", email: "admin@example.com" } };
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

// Exercise actual components and handlers using deterministic hook state. SDK
// helpers are tested separately; browser review checks the unchanged visual design.
function harness(file, { value = { state: { status: "signedOut" } }, auth, pathname = "/admin/", imports = {}, globals = {} } = {}) {
  const hooks = [], effects = [], redirects = [];
  let cursor = 0;
  const slot = (initial) => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return index; };
  const changed = (previous, next) => !previous || !next || next.some((item, index) => item !== previous[index]);
  const react = {
    useState: (initial) => { const index = slot(typeof initial === "function" ? initial() : initial); return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; },
    useRef: (value) => hooks[slot({ current: value })],
    useCallback: (fn, deps) => { const index = slot({ fn, deps }); if (changed(hooks[index].deps, deps)) hooks[index] = { fn, deps }; return hooks[index].fn; },
    useEffect: (fn, deps) => { const index = slot({ deps: undefined }); if (changed(hooks[index].deps, deps)) { hooks[index].deps = deps; effects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = fn(); }); } },
    createContext: () => ({ Provider: "provider" }), useContext: () => value,
  };
  const router = { replace: (url) => redirects.push(url) };
  const context = { exports: {}, URL, ...globals, require: (name) => {
    if (name in imports) return imports[name];
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/navigation") return { useRouter: () => router, usePathname: () => pathname };
    if (name === "next/link") return { default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) };
    if (name.endsWith("AdminAuthProvider")) return { useAdminAuth: () => value };
    if (name.endsWith("AdminIcon")) return { default: () => jsx.jsx("span", {}) };
    if (name.endsWith("admin.module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "@/lib/admin/auth") return { authMessages: messages, createAdminAuth: () => auth };
    if (name === "@/lib/appwrite/client") return { account: {}, teams: {} };
    if (name === "@/lib/appwrite/config") return { appwriteConfig: {} };
    throw new Error(`Unexpected import: ${name}`);
  } };
  Object.defineProperty(context, "localStorage", { get() { throw new Error("Manual persistent auth storage is prohibited"); } });
  Object.defineProperty(context, "sessionStorage", { get() { throw new Error("Manual persistent auth storage is prohibited"); } });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: options }).outputText, context);
  const render = (props = {}) => { cursor = 0; return context.exports.default(props); };
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
  };
  return { render, find, redirects, flush: () => { while (effects.length) effects.shift()(); },
    unmount: () => hooks.forEach((hook) => hook?.cleanup?.()), setValue: (next) => { value = next; } };
}

test("provider starts loading, restores centrally, and supplies authorized identity", async () => {
  const pending = deferred(); let requests = 0;
  const ui = harness("components/admin/AdminAuthProvider.tsx", { auth: { restore: () => { requests++; return pending.promise; } } });
  assert.equal(ui.render().props.value.state.status, "loading");
  ui.flush();
  assert.equal(requests, 1);
  assert.equal(ui.render().props.value.state.status, "loading");
  pending.resolve(authorized); await tick();
  assert.equal(ui.render().props.value.state.status, "authorized");
});

test("provider ignores stale restoration after a newer login", async () => {
  const pending = deferred(); let staleDenied;
  const ui = harness("components/admin/AdminAuthProvider.tsx", { auth: {
    restore: (denied) => { staleDenied = denied; return pending.promise; }, login: async () => authorized,
  } });
  ui.render(); ui.flush();
  await ui.render().props.value.login("admin@example.com", "test-password");
  assert.equal(staleDenied({ status: "forbidden", message: messages.forbidden }), false);
  pending.resolve({ status: "signedOut" }); await tick();
  assert.equal(ui.render().props.value.state.status, "authorized");
});

test("unmounted provider cannot publish denial or initiate stale cleanup", async () => {
  const pending = deferred(); let denied;
  const ui = harness("components/admin/AdminAuthProvider.tsx", { auth: { restore: (callback) => { denied = callback; return pending.promise; } } });
  ui.render(); ui.flush(); ui.unmount();
  assert.equal(denied({ status: "forbidden", message: messages.forbidden }), false);
  pending.resolve({ status: "signedOut" }); await tick();
  assert.equal(ui.render().props.value.state.status, "loading");
});

test("provider publishes forbidden before session cleanup settles", async () => {
  const pending = deferred();
  const ui = harness("components/admin/AdminAuthProvider.tsx", { auth: { restore: (denied) => {
    denied({ status: "forbidden", message: messages.forbidden }); return pending.promise;
  } } });
  ui.render(); ui.flush();
  assert.equal(ui.render().props.value.state.status, "forbidden");
  pending.resolve({ status: "forbidden", message: messages.forbidden }); await tick();
  assert.equal(ui.render().props.value.state.status, "forbidden");
});

test("provider prevents duplicate login and recovers from unexpected errors", async () => {
  const pending = deferred(); let calls = 0;
  const ui = harness("components/admin/AdminAuthProvider.tsx", { auth: { login: () => { calls++; return pending.promise; } } });
  const first = ui.render().props.value.login("admin@example.com", "test-password");
  await ui.render().props.value.login("admin@example.com", "test-password");
  assert.equal(calls, 1);
  pending.resolve(authorized); await first;
  assert.equal(ui.render().props.value.state.status, "authorized");
  const broken = harness("components/admin/AdminAuthProvider.tsx", { auth: { login: async () => { throw new Error("private details"); } } });
  await broken.render().props.value.login("admin@example.com", "test-password");
  assert.equal(broken.render().props.value.state.message, messages.login);
});

for (const pathname of ["/admin/", "/admin/leads/", "/admin/lead/?id=lead-001"]) {
  test(`signed-out direct navigation to ${pathname} redirects once and never renders workspace`, () => {
    const ui = harness("components/admin/AdminGuard.tsx", { pathname });
    const props = { children: "PROTECTED WORKSPACE" };
    assert.ok(!renderToStaticMarkup(ui.render(props)).includes("PROTECTED WORKSPACE"));
    ui.flush(); ui.render(props); ui.flush();
    assert.deepEqual(ui.redirects, ["/admin/login/"]);
  });
}
test("guard renders no workspace while checking session; authorized users can access it", () => {
  const ui = harness("components/admin/AdminGuard.tsx", { value: { state: { status: "loading" } } });
  assert.match(renderToStaticMarkup(ui.render({ children: "PROTECTED WORKSPACE" })), /Checking admin session/);
  assert.ok(!renderToStaticMarkup(ui.render({ children: "PROTECTED WORKSPACE" })).includes("PROTECTED WORKSPACE"));
  ui.flush(); assert.deepEqual(ui.redirects, []);
  ui.setValue({ state: authorized });
  assert.equal(renderToStaticMarkup(ui.render({ children: "PROTECTED WORKSPACE" })), "PROTECTED WORKSPACE");
  ui.flush(); assert.deepEqual(ui.redirects, []);
});
test("forbidden guard displays only safe denial, hides content, and does not bounce routes", () => {
  const ui = harness("components/admin/AdminGuard.tsx", { value: { state: { status: "forbidden", message: "private details" } } });
  const html = renderToStaticMarkup(ui.render({ children: "PROTECTED WORKSPACE" }));
  assert.ok(html.includes(messages.forbidden));
  assert.ok(!html.includes("private details"));
  assert.ok(!html.includes("PROTECTED WORKSPACE"));
  ui.flush(); assert.deepEqual(ui.redirects, []);
});
test("verification error hides protected UI and provides retry without redirects", () => {
  let retries = 0;
  const ui = harness("components/admin/AdminGuard.tsx", { value: { state: { status: "error", message: messages.verification }, refresh: () => { retries++; } } });
  const rendered = ui.render({ children: "PROTECTED WORKSPACE" });
  assert.ok(!renderToStaticMarkup(rendered).includes("PROTECTED WORKSPACE"));
  ui.find(rendered, (node) => node.type === "button").props.onClick();
  assert.equal(retries, 1);
  ui.flush(); assert.deepEqual(ui.redirects, []);
});
test("authorized admin on login is redirected without displaying a form", () => {
  const ui = harness("components/admin/LoginForm.tsx", { value: { state: authorized } });
  assert.equal(ui.find(ui.render(), (node) => node.type === "form"), undefined);
  ui.flush(); assert.deepEqual(ui.redirects, ["/admin/"]);
});
test("forbidden login displays the safe denial and does not redirect automatically", () => {
  const ui = harness("components/admin/LoginForm.tsx", { value: { state: { status: "forbidden", message: "private details" } } });
  const html = renderToStaticMarkup(ui.render());
  assert.ok(html.includes(messages.forbidden));
  assert.ok(!html.includes("private details"));
  ui.flush(); assert.deepEqual(ui.redirects, []);
});
test("login starts with blank credentials, accessible autocomplete and checking state", () => {
  const ui = harness("components/admin/LoginForm.tsx");
  const rendered = ui.render();
  const email = ui.find(rendered, (node) => node.type === "input" && node.props.name === "email");
  const password = ui.find(rendered, (node) => node.type === "input" && node.props.name === "password");
  assert.equal(email.props.autoComplete, "email");
  assert.equal(password.props.autoComplete, "current-password");
  assert.equal(email.props.defaultValue, undefined);
  assert.equal(password.props.defaultValue, undefined);
  ui.setValue({ state: { status: "loading" } });
  assert.equal(ui.find(ui.render(), (node) => node.type === "form"), undefined);
});
test("login submits trimmed email once, disables controls while pending, clears password, and restores controls", async () => {
  class Input { constructor(value) { this.value = value; } }
  const password = new Input("test-password");
  const form = { elements: { namedItem: () => password } };
  const pending = deferred(); const calls = [];
  const ui = harness("components/admin/LoginForm.tsx", { value: { state: { status: "signedOut" }, login: async (...args) => { calls.push(args); await pending.promise; } },
    globals: { HTMLInputElement: Input, FormData: class { get(key) { return key === "email" ? " admin@example.com " : password.value; } } } });
  const event = { preventDefault() {}, currentTarget: form };
  const first = ui.find(ui.render(), (node) => node.type === "form").props.onSubmit(event);
  await ui.find(ui.render(), (node) => node.type === "form").props.onSubmit(event);
  assert.deepEqual(calls, [["admin@example.com", "test-password"]]);
  const loading = ui.render();
  assert.equal(ui.find(loading, (node) => node.type === "form").props["aria-busy"], true);
  assert.equal(ui.find(loading, (node) => node.type === "button" && node.props.type === "submit").props.disabled, true);
  assert.equal(ui.find(loading, (node) => node.type === "button" && node.props.type === "submit").props.children, "Signing in…");
  pending.resolve(); await first;
  assert.equal(password.value, "");
  assert.equal(ui.find(ui.render(), (node) => node.type === "button" && node.props.type === "submit").props.disabled, false);
});
test("missing login fields show an accessible validation error without an auth call", async () => {
  let requests = 0;
  const ui = harness("components/admin/LoginForm.tsx", { value: { state: { status: "signedOut" }, login: () => { requests++; } },
    globals: { FormData: class { get() { return " "; } } } });
  await ui.find(ui.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(requests, 0);
  assert.equal(ui.find(ui.render(), (node) => node.props?.role === "alert").props["aria-live"], "polite");
});
test("provider logout success clears state and guard redirects; failure preserves identity and restores busy state", async () => {
  for (const success of [true, false]) {
    const pending = deferred();
    const ui = harness("components/admin/AdminAuthProvider.tsx", { auth: { restore: async () => authorized, logout: () => pending.promise } });
    ui.render(); ui.flush(); await tick();
    const result = ui.render().props.value.logout();
    assert.equal(ui.render().props.value.loggingOut, true);
    pending.resolve({ success, message: success ? undefined : messages.logout });
    assert.equal(await result, success);
    const value = ui.render().props.value;
    assert.equal(value.loggingOut, false);
    assert.equal(value.state.status, success ? "signedOut" : "authorized");
    assert.equal(value.logoutError, success ? "" : messages.logout);
    const guard = harness("components/admin/AdminGuard.tsx", { value });
    guard.render(); guard.flush();
    assert.deepEqual(guard.redirects, success ? ["/admin/login/"] : []);
  }
});
test("navbar uses logout button with shared pending/error feedback and real identity", async () => {
  let attempts = 0;
  const value = { state: authorized, logout: async () => { attempts++; }, loggingOut: false, logoutError: "" };
  const ui = harness("components/admin/AdminNavbar.tsx", { value });
  const button = ui.find(ui.render(), (node) => node.type === "button" && node.props.children?.includes("Logout"));
  button.props.onClick(); assert.equal(attempts, 1);
  ui.setValue({ ...value, loggingOut: true, logoutError: messages.logout });
  const tree = ui.render();
  assert.equal(ui.find(tree, (node) => node.type === "button" && node.props.children?.includes("Signing out…")).props.disabled, true);
  assert.equal(ui.find(tree, (node) => node.props?.role === "alert").props.children, messages.logout);
  assert.ok(renderToStaticMarkup(tree).includes("Signed in as Test Admin"));
});
test("mock provider remains inside the guard; auth source never manually persists credentials or expands backend scope", () => {
  const workspace = fs.readFileSync("app/admin/(workspace)/layout.tsx", "utf8");
  assert.match(workspace, /<AdminGuard><MockLeadsProvider>/);
  for (const file of ["lib/admin/auth.ts", "components/admin/AdminAuthProvider.tsx", "components/admin/AdminGuard.tsx", "components/admin/LoginForm.tsx", "components/admin/AdminNavbar.tsx"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|setSession\(|createJWT\(|tablesDB\.|Role\.users\(|account\.create\(/);
    assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
  }
  assert.match(fs.readFileSync("lib/appwrite/client.ts", "utf8"), /teams = new Teams\(client\)/);
  assert.match(fs.readFileSync(".env.example", "utf8"), /^NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID=$/m);
  assert.match(fs.readFileSync("components/Contact.tsx", "utf8"), /submitEnquiry\(payload\)/);
  assert.match(fs.readFileSync("next.config.mjs", "utf8"), /output: 'export'/);
});
