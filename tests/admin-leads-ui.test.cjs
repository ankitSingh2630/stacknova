const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const { Query } = require("appwrite");
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const compiled = file => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: options }).outputText;
function moduleValue(file, imports = {}) {
  const context = { exports: {}, require: name => imports[name] || { Query } };
  vm.runInNewContext(compiled(file), context); return context.exports;
}
const types = moduleValue("lib/admin/types.ts");
const api = moduleValue("lib/admin/leads.ts", { "./types": types });
const format = moduleValue("lib/admin/format.ts");
const authorized = { status: "authorized", user: { $id: "test-admin" } };
const auth = { state: authorized, recheckSession: async () => {} };
const row = {
  $id: "real-row-1", $createdAt: "2026-10-09T03:30:00.000Z", $updatedAt: "2026-10-09T04:30:00.000Z",
  name: "Actual Customer", email: "customer@example.com", phone: "+91 9876543210", company: "Example Company",
  service: "Web Development", message: "Real project requirements", source: "StackNova Website", status: "New", notes: "Existing notes", deletedAt: null,
};
const lead = api.mapLeadRow(row);
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const plain = value => JSON.parse(JSON.stringify(value));
function harness(file, { authValue = auth, leadsValue, reader, id = null } = {}) {
  const hooks = [], effects = [];
  let cursor = 0;
  const slot = initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return index; };
  const changed = (before, after) => !before || !after || after.some((value, index) => before[index] !== value);
  const react = {
    useState: initial => { const index = slot(typeof initial === "function" ? initial() : initial); return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; },
    useRef: value => hooks[slot({ current: value })],
    useCallback: (fn, deps) => { const index = slot({ fn, deps }); if (changed(hooks[index].deps, deps)) hooks[index] = { fn, deps }; return hooks[index].fn; },
    useEffect: (fn, deps) => { const index = slot({ deps: undefined }); if (changed(hooks[index].deps, deps)) { hooks[index].deps = deps; effects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = fn(); }); } },
    createContext: () => ({ Provider: "provider" }), useContext: () => leadsValue,
  };
  const requireModule = name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/link") return { default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) };
    if (name === "next/navigation") return { useSearchParams: () => ({ get: () => id }) };
    if (name.endsWith("AdminAuthProvider")) return { useAdminAuth: () => authValue };
    if (name.endsWith("LeadsProvider")) return { useLeads: () => leadsValue };
    if (name.endsWith("AdminIcon")) return { default: () => jsx.jsx("span", {}) };
    if (name.endsWith("StatusBadge")) return { default: ({ status }) => jsx.jsx("span", { children: status }) };
    if (name.endsWith("admin.module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "@/lib/admin/types") return types;
    if (name === "@/lib/admin/format") return format;
    if (name === "@/lib/admin/leads") return { ...api, ...(reader ? { createLeadsReader: () => reader } : {}) };
    if (name === "@/lib/appwrite/client") return { tablesDB: {} };
    if (name === "@/lib/appwrite/config") return { appwriteConfig: {} };
    if (name === "./LeadsState") return { default: loadComponent("components/admin/LeadsState.tsx") };
    throw new Error(`Unexpected import ${name}`);
  };
  function loadComponent(path) {
    const context = { exports: {}, require: requireModule, navigator: { clipboard: { writeText: async () => {} } } };
    vm.runInNewContext(compiled(path), context); return context.exports.default;
  }
  const component = loadComponent(file);
  const render = (props = {}) => { cursor = 0; return component(props); };
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    if (typeof node.type === "function") return find(node.type(node.props), predicate);
    for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
  };
  return { render, find, flush: () => { while (effects.length) effects.shift()(); },
    unmount: () => hooks.forEach(hook => hook?.cleanup?.()), setAuth: next => { authValue = next; }, setLeads: next => { leadsValue = next; } };
}
const loaded = (leads = [lead], total = leads.length) => ({ leads, total, loading: false, error: "", refreshLeads: async () => {} });
async function provider(reader, authValue = auth) {
  const ui = harness("components/admin/LeadsProvider.tsx", { reader, authValue });
  ui.render(); ui.flush(); await tick(); return ui;
}

for (const status of ["loading", "signedOut", "forbidden", "error"]) {
  test(`${status} auth state cannot fetch list or details`, async () => {
    let reads = 0;
    const ui = await provider({ list: async () => { reads++; }, detail: async () => { reads++; } }, { ...auth, state: { status } });
    await ui.render().props.value.ensureLead(lead.id);
    assert.equal(reads, 0);
    assert.equal(ui.render().props.value.leads.length, 0);
  });
}
test("authorized provider loads real leads centrally and preserves returned total", async () => {
  const pending = deferred(); let calls = 0;
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: { list: () => { calls++; return pending.promise; } } });
  assert.equal(ui.render().props.value.loading, true);
  ui.flush(); assert.equal(calls, 1);
  pending.resolve({ ok: true, leads: [lead], total: 137 }); await tick();
  const value = ui.render().props.value;
  assert.equal(value.loading, false);
  assert.equal(value.total, 137);
  assert.equal(value.leads[0].name, lead.name);
  ui.flush(); await tick(); assert.equal(calls, 1);
});
test("failed read has no hidden data fallback; manual refresh can recover", async () => {
  let calls = 0;
  const ui = await provider({ list: async () => ++calls === 1 ? { ok: false, kind: "failure", message: api.leadsMessages.failure } : { ok: true, leads: [lead], total: 1 } });
  const failed = ui.render().props.value;
  assert.equal(failed.error, api.leadsMessages.failure);
  assert.equal(failed.leads.length, 0);
  assert.equal(failed.total, 0);
  await failed.refreshLeads();
  assert.equal(ui.render().props.value.leads[0].id, lead.id);
  assert.equal(calls, 2);
});
test("401 clears list/detail data and causes one controlled auth recheck without read/recheck loop", async () => {
  let lists = 0, checks = 0;
  const ui = await provider({ list: async () => { lists++; return { ok: true, leads: [lead], total: 1 }; },
    detail: async () => ({ ok: false, kind: "session", message: api.leadsMessages.session }) },
  { ...auth, recheckSession: async () => { checks++; } });
  await ui.render().props.value.ensureLead("older-row");
  const value = ui.render().props.value;
  assert.equal(value.leads.length, 0);
  assert.equal(value.total, 0);
  assert.equal(value.getLeadState(lead.id).status, "error");
  assert.equal(checks, 1);
  for (let i = 0; i < 3; i++) { ui.render(); ui.flush(); await tick(); }
  await ui.render().props.value.ensureLead("other-row");
  assert.equal(lists, 1);
  assert.equal(checks, 1);
});
test("403 preserves authorized account and stops with safe read-access feedback", async () => {
  let calls = 0, checks = 0;
  const authValue = { ...auth, recheckSession: async () => { checks++; } };
  const ui = await provider({ list: async () => { calls++; return { ok: false, kind: "access", message: api.leadsMessages.access }; } }, authValue);
  assert.equal(ui.render().props.value.error, api.leadsMessages.access);
  assert.equal(authValue.state.status, "authorized");
  for (let i = 0; i < 3; i++) { ui.render(); ui.flush(); await tick(); }
  assert.equal(checks, 0);
  assert.equal(calls, 1);
});
test("401 at list entry does not refetch when central auth remains authorized", async () => {
  let lists = 0, checks = 0;
  const ui = await provider({ list: async () => { lists++; return { ok: false, kind: "session", message: api.leadsMessages.session }; } },
    { ...auth, recheckSession: async () => { checks++; } });
  for (let i = 0; i < 3; i++) { ui.render(); ui.flush(); await tick(); }
  assert.equal(lists, 1); assert.equal(checks, 1);
});
test("identity change immediately hides old cache and ignores stale reads", async () => {
  const pending = deferred(); let reads = 0;
  const ui = await provider({ list: async () => ++reads === 1 ? { ok: true, leads: [lead], total: 1 } : pending.promise });
  ui.setAuth({ ...auth, state: { status: "authorized", user: { $id: "other-admin" } } });
  assert.equal(ui.render().props.value.leads.length, 0);
  assert.equal(ui.render().props.value.getLeadState(lead.id).status, "loading");
  ui.flush();
  ui.setAuth({ ...auth, state: { status: "signedOut" } }); ui.render(); ui.flush();
  pending.resolve({ ok: true, leads: [lead], total: 1 }); await tick();
  assert.equal(ui.render().props.value.leads.length, 0);
});
test("unmounted provider ignores pending database result", async () => {
  const pending = deferred();
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: { list: () => pending.promise } });
  ui.render(); ui.flush(); ui.unmount();
  pending.resolve({ ok: true, leads: [lead], total: 1 }); await tick();
  assert.equal(ui.render().props.value.leads.length, 0);
});

test("a later manual refresh wins over an older pending list result", async () => {
  const older = deferred(); let reads = 0;
  const newer = { ...lead, id: "newer-row", name: "Latest Customer" };
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: {
    list: async () => ++reads === 1 ? older.promise : { ok: true, leads: [newer], total: 2 },
  } });
  ui.render(); ui.flush();
  await ui.render().props.value.refreshLeads();
  older.resolve({ ok: true, leads: [lead], total: 1 }); await tick();
  assert.equal(ui.render().props.value.leads[0].id, newer.id);
  assert.equal(ui.render().props.value.total, 2);
});

test("a pending detail response cannot repopulate private data after another read fails", async () => {
  const first = deferred(), second = deferred(); let checks = 0;
  const ui = await provider({ list: async () => ({ ok: true, leads: [lead], total: 1 }),
    detail: id => id === "first-row" ? first.promise : second.promise }, { ...auth, recheckSession: async () => { checks++; } });
  const firstRead = ui.render().props.value.ensureLead("first-row");
  const secondRead = ui.render().props.value.ensureLead("second-row");
  first.resolve({ ok: false, kind: "session", message: api.leadsMessages.session }); await firstRead;
  second.resolve({ ok: true, lead: { ...lead, id: "second-row" } }); await secondRead;
  assert.equal(ui.render().props.value.leads.length, 0);
  assert.equal(ui.render().props.value.getLeadState("second-row").status, "error");
  assert.equal(checks, 1);
});
test("provider reuses loaded/cache data and fetches outside-batch runtime IDs only once", async () => {
  let details = 0;
  const older = { ...lead, id: "older-row" };
  const ui = await provider({ list: async () => ({ ok: true, leads: [lead], total: 137 }), detail: async () => { details++; return { ok: true, lead: older }; } });
  await ui.render().props.value.ensureLead(lead.id); assert.equal(details, 0);
  await ui.render().props.value.ensureLead(older.id);
  await ui.render().props.value.ensureLead(older.id);
  assert.equal(details, 1);
  assert.equal(ui.render().props.value.getLeadState(older.id).lead.id, older.id);
  assert.equal(ui.render().props.value.leads.length, 1, "detail cache does not inflate batch statistics");
  assert.equal(ui.render().props.value.total, 137);
});
test("pending detail calls deduplicate and not-found IDs are cached safely", async () => {
  let calls = 0; const pending = deferred();
  const ui = await provider({ list: async () => ({ ok: true, leads: [], total: 0 }), detail: () => { calls++; return pending.promise; } });
  const first = ui.render().props.value.ensureLead("unknown-row");
  await ui.render().props.value.ensureLead("unknown-row");
  assert.equal(ui.render().props.value.getLeadState("unknown-row").status, "loading");
  pending.resolve({ ok: true, lead: null }); await first;
  assert.equal(ui.render().props.value.getLeadState("unknown-row").status, "notFound");
  await ui.render().props.value.ensureLead("unknown-row"); assert.equal(calls, 1);
});
test("dashboard shows real batch statistics, recent order, and latest-100 limitation", () => {
  const leads = [lead, { ...lead, id: "older", name: "Older Customer", status: "Closed", createdAt: "2026-10-01T00:00:00Z" }];
  const ui = harness("components/admin/Dashboard.tsx", { leadsValue: loaded(leads, 137) });
  const html = renderToStaticMarkup(ui.render());
  assert.ok(html.includes("Showing latest 2 of 137 leads"));
  assert.ok(html.indexOf(lead.name) < html.indexOf("Older Customer"));
  assert.ok(html.includes("Closed"));
  assert.ok(html.includes("Open Pipeline"));
  assert.ok(!html.includes("Demo sync"));
  assert.ok(!html.includes("137</p>"), "status metrics must not imply full-table statistics");
  ui.setLeads(loaded(leads)); assert.ok(!renderToStaticMarkup(ui.render()).includes("Showing latest"));
});
test("dashboard loading/error/empty states never show cached lead values", () => {
  const ui = harness("components/admin/Dashboard.tsx", { leadsValue: { ...loaded(), loading: true } });
  assert.match(renderToStaticMarkup(ui.render()), /Loading leads/);
  assert.ok(!renderToStaticMarkup(ui.render()).includes(lead.name));
  ui.setLeads({ ...loaded(), error: api.leadsMessages.failure }); assert.match(renderToStaticMarkup(ui.render()), /Unable to load leads/);
  ui.setLeads(loaded([])); assert.match(renderToStaticMarkup(ui.render()), /No leads found/);
});
test("list preserves real desktop rows/mobile cards and client-side search/filter/pagination", () => {
  const leads = Array.from({ length: 8 }, (_, index) => ({ ...lead, id: `row-${index}`, name: `Customer ${index}`,
    company: `Business ${index}`, service: index % 2 ? "UI/UX Design" : "Web Development", status: index % 2 ? "Contacted" : "New" }));
  const ui = harness("components/admin/LeadsList.tsx", { leadsValue: loaded(leads, 137) });
  let html = renderToStaticMarkup(ui.render());
  assert.ok(html.includes("<table")); assert.ok(html.includes('class="leadCards"'));
  assert.ok(html.includes("Customer 0")); assert.ok(!html.includes("Customer 7"));
  assert.ok(html.includes("Showing latest 8 of 137 leads"));
  ui.find(ui.render(), node => node.props?.["aria-label"] === "Next page").props.onClick();
  html = renderToStaticMarkup(ui.render()); assert.ok(html.includes("Customer 7")); assert.ok(!html.includes("Customer 0"));
  ui.find(ui.render(), node => node.type === "input").props.onChange({ target: { value: "business 3" } });
  html = renderToStaticMarkup(ui.render()); assert.ok(html.includes("Customer 3")); assert.ok(!html.includes("Customer 2"));
  ui.find(ui.render(), node => node.type === "input").props.onChange({ target: { value: "" } });
  ui.find(ui.render(), node => node.props?.["aria-label"] === "Filter by status").props.onChange({ target: { value: "New" } });
  html = renderToStaticMarkup(ui.render()); assert.ok(html.includes("Customer 0")); assert.ok(!html.includes("Customer 1"));
  ui.find(ui.render(), node => node.props?.["aria-label"] === "Filter by status").props.onChange({ target: { value: "" } });
  ui.find(ui.render(), node => node.props?.["aria-label"] === "Filter by service").props.onChange({ target: { value: "UI/UX Design" } });
  html = renderToStaticMarkup(ui.render()); assert.ok(html.includes("Customer 1")); assert.ok(!html.includes("Customer 0"));
});
test("list loading/error/empty/no-match states and retry are safe", async () => {
  let retries = 0;
  const value = { ...loaded(), error: api.leadsMessages.failure, refreshLeads: async () => { retries++; } };
  const ui = harness("components/admin/LeadsList.tsx", { leadsValue: value });
  assert.ok(!renderToStaticMarkup(ui.render()).includes(lead.name));
  ui.find(ui.render(), node => node.type === "button").props.onClick(); assert.equal(retries, 1);
  ui.setLeads({ ...value, error: "", loading: true }); assert.match(renderToStaticMarkup(ui.render()), /Loading leads/);
  ui.setLeads(loaded([])); assert.match(renderToStaticMarkup(ui.render()), /No leads found/);
  ui.setLeads(loaded()); ui.find(ui.render(), node => node.type === "input").props.onChange({ target: { value: "no matching customer" } });
  assert.match(renderToStaticMarkup(ui.render()), /No leads found/);
});
test("detail uses real runtime ID, displays notes/timestamps, and disables every mutation", () => {
  let lookups = 0;
  const value = { ...loaded(), getLeadState: id => { assert.equal(id, lead.id); return { status: "loaded", lead }; }, ensureLead: async id => { assert.equal(id, lead.id); lookups++; } };
  const ui = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: value });
  const html = renderToStaticMarkup(ui.render());
  assert.ok(html.includes(lead.message)); assert.ok(html.includes(lead.notes));
  assert.ok(html.includes(lead.createdAt)); assert.ok(html.includes(lead.updatedAt));
  ui.flush(); assert.equal(lookups, 1);
  for (const type of ["select", "textarea"]) {
    const control = ui.find(ui.render(), node => node.type === type);
    assert.equal(control.props.disabled, true); assert.equal(control.props.onChange, undefined);
  }
  for (const label of ["Add Note", "Delete Lead"]) {
    const button = ui.find(ui.render(), node => node.type === "button" && [node.props.children].flat(Infinity).includes(label));
    assert.equal(button.props.disabled, true); assert.equal(button.props.onClick, undefined);
  }
  assert.ok(!html.includes("<form")); assert.ok(!html.includes("<dialog"));
});
test("missing/invalid/unknown detail IDs display safe unavailable states", () => {
  for (const id of [null, "../private", "unknown-row"]) {
    let reads = 0;
    const ui = harness("components/admin/LeadDetails.tsx", { id, leadsValue: { ...loaded(), ensureLead: async () => { reads++; }, getLeadState: () => ({ status: "notFound" }) } });
    const html = renderToStaticMarkup(ui.render()); ui.flush();
    assert.ok(html.includes(id ? "Lead unavailable" : "Choose a lead"));
    assert.ok(!html.includes(lead.name)); if (id !== "unknown-row") assert.equal(reads, 0);
  }
});
test("direct detail refresh waits for list, then resolves an outside-batch row through central provider", async () => {
  let reads = 0;
  const older = { ...lead, id: "older-row" };
  const list = deferred();
  const store = harness("components/admin/LeadsProvider.tsx", { reader: { list: () => list.promise, detail: async () => { reads++; return { ok: true, lead: older }; } } });
  store.render(); store.flush();
  const page = harness("components/admin/LeadDetails.tsx", { id: older.id, leadsValue: store.render().props.value });
  assert.match(renderToStaticMarkup(page.render()), /Loading leads/); page.flush(); await tick(); assert.equal(reads, 0);
  list.resolve({ ok: true, leads: [], total: 0 }); await tick();
  page.setLeads(store.render().props.value); page.render(); page.flush(); await tick();
  page.setLeads(store.render().props.value);
  assert.ok(renderToStaticMarkup(page.render()).includes(older.name)); assert.equal(reads, 1);
});
test("detail read failure displays safe error and a real refresh action", () => {
  let retries = 0;
  const ui = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: { ...loaded(), getLeadState: () => ({ status: "error", message: api.leadsMessages.failure }),
    ensureLead: async () => {}, refreshLeads: async () => { retries++; } } });
  assert.match(renderToStaticMarkup(ui.render()), /Unable to load leads/);
  assert.ok(!renderToStaticMarkup(ui.render()).includes(lead.name));
  ui.find(ui.render(), node => node.type === "button").props.onClick(); assert.equal(retries, 1);
});
test("real text renders escaped, including message and notes", () => {
  const unsafe = { ...lead, name: "<script>alert(1)</script>", message: "<img src=x onerror=alert(1)>", notes: "<script>notes</script>" };
  const ui = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: { ...loaded(), getLeadState: () => ({ status: "loaded", lead: unsafe }), ensureLead: async () => {} } });
  const html = renderToStaticMarkup(ui.render());
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("<img"));
});
test("production runtime has no mock data or database write methods; detail URL and Suspense stay static", () => {
  assert.equal(fs.existsSync("components/admin/MockLeadsProvider.tsx"), false);
  assert.equal(fs.existsSync("lib/admin/mock-data.ts"), false);
  for (const directory of ["components/admin", "lib/admin", "app/admin"]) {
    const inspect = path => {
      if (fs.statSync(path).isDirectory()) { for (const entry of fs.readdirSync(path)) inspect(`${path}/${entry}`); return; }
      if (!/\.(tsx?|css)$/.test(path)) return;
      const source = fs.readFileSync(path, "utf8");
      assert.doesNotMatch(source, /MockLeadsProvider|mock-data|useMockLeads|\.updateRow\(|\.deleteRow\(|\.createRow\(/, path);
    };
    inspect(directory);
  }
  assert.match(fs.readFileSync("app/admin/(workspace)/layout.tsx", "utf8"), /<AdminGuard><LeadsProvider>/);
  assert.match(fs.readFileSync("app/admin/(workspace)/lead/page.tsx", "utf8"), /<Suspense/);
  assert.equal(fs.existsSync("app/admin/leads/[id]"), false);
});
