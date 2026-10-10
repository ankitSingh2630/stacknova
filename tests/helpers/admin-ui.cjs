const fs = require("node:fs"), vm = require("node:vm"), ts = require("typescript");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const { types, api, format, mutationApi, queries, dashboardApi, emailApi } = require("./admin.cjs");
const auth = { state: { status: "authorized", user: { $id: "test-admin" } }, recheckSession: async () => {} };
const row = { $id: "real-row-1", $createdAt: "2026-10-09T03:30:00.000Z", $updatedAt: "2026-10-09T04:30:00.000Z",
  name: "Actual Customer", email: "customer@example.com", phone: "+91 9876543210", company: "Example Company",
  service: "Web Development", message: "Real project requirements", source: "StackNova Website", status: "New", notes: "Existing notes", deletedAt: null };
const lead = api.mapLeadRow(row);
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const plain = value => JSON.parse(JSON.stringify(value));
const statistics = leads => ({ total: leads.length, ...Object.fromEntries(types.leadStatuses.map(status => [status, leads.filter(lead => lead.status === status).length])) });
const summary = (leads = [lead], total = leads.length) => ({ total, recent: leads.slice(0, 5), counts: statistics(leads), warning: "" });
const loaded = (leads = [lead], total = leads.length) => ({ leads, total, ready: true, loading: false, initialized: true, error: "", warning: "",
  query: queries.initialLeadQuery, appliedQuery: queries.initialLeadQuery, searchDraft: "", searchPending: false, pageSize: 5,
  dashboard: { summary: summary(leads, total), loading: false, initialized: true, error: "" },
  ensureList: async () => {}, refreshLeads: async () => {}, ensureDashboard: async () => {}, refreshDashboard: async () => {},
  setSearch() {}, setFilters() {}, setPage() {}, clearFilters() {},
  getMutationState: () => mutationApi.emptyMutation, updateLeadStatus: async () => false, addLeadNote: async () => false, deleteLead: async () => false, reportEmailSessionFailure: async () => {} });

function harness(file, { authValue = auth, leadsValue, reader, writer, dashboardReader, tablesDB, emailSender, id = null, pathname = "/admin/" } = {}) {
  const hooks = [], effects = [], timers = new Map(), redirects = [], listeners = new Map();
  let cursor = 0, clock = 0, timerId = 0;
  const slot = initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return index; };
  const changed = (before, after) => !before || !after || after.some((value, index) => before[index] !== value);
  const react = {
    useState: initial => { const index = slot(typeof initial === "function" ? initial() : initial); return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; },
    useRef: value => hooks[slot({ current: value })],
    useCallback: (fn, deps) => { const index = slot({ fn, deps }); if (changed(hooks[index].deps, deps)) hooks[index] = { fn, deps }; return hooks[index].fn; },
    useEffect: (fn, deps) => { const index = slot({ deps: undefined, effect: true }); if (changed(hooks[index].deps, deps)) { hooks[index].deps = deps; hooks[index].fn = fn; effects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = fn(); }); } },
    createContext: () => ({ Provider: "provider" }), useContext: () => leadsValue,
  };
  const requireModule = name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/link") return { default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) };
    if (name === "next/navigation") return { usePathname: () => pathname, useSearchParams: () => ({ get: () => id }), useRouter: () => ({ replace: url => redirects.push(url) }) };
    if (name.endsWith("AdminAuthProvider")) return { useAdminAuth: () => authValue };
    if (name.endsWith("LeadsProvider")) return { useLeads: () => leadsValue };
    if (name.endsWith("AdminIcon")) return { default: () => jsx.jsx("span", {}) };
    if (name.endsWith("StatusBadge")) return { default: ({ status }) => jsx.jsx("span", { children: status }) };
    if (name.endsWith("admin.module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "@/lib/admin/types") return types;
    if (name === "@/lib/admin/format") return format;
    if (name === "@/lib/admin/lead-email") return { ...emailApi, createLeadEmailSender: () => emailSender || (async () => ({ ok: false, kind: "failure", message: emailApi.emailFailureMessage })) };
    if (name === "@/lib/admin/lead-queries") return queries;
    if (name === "@/lib/admin/leads") return { ...api, ...(reader ? { createLeadsReader: () => reader } : {}) };
    if (name === "@/lib/admin/lead-mutations") return { ...mutationApi, ...(writer ? { createLeadMutations: () => writer } : {}) };
    if (name === "@/lib/admin/dashboard") return { ...dashboardApi, ...(!tablesDB || dashboardReader ? { createDashboardReader: () => dashboardReader || { summary: async () => ({ ok: true, summary: summary() }) } } : {}) };
    if (name === "@/lib/appwrite/client") return { tablesDB: tablesDB || {} };
    if (name === "@/lib/appwrite/config") return { appwriteConfig: { databaseId: "test-db", leadsTableId: "test-leads" } };
    if (name === "./LeadsState") return { default: loadComponent("components/admin/LeadsState.tsx") };
    if (name === "./LeadEmailPanel") return { default: loadComponent("components/admin/LeadEmailPanel.tsx") };
    throw new Error(`Unexpected import ${name}`);
  };
  function loadComponent(path) {
    const context = { exports: {}, require: requireModule, document: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }, navigator: { clipboard: { writeText: async () => {} } },
      setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: clock + delay }); return id; }, clearTimeout: id => timers.delete(id) };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, context); return context.exports.default;
  }
  const component = loadComponent(file);
  const render = (props = {}) => { cursor = 0; return component(props); };
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    if (typeof node.type === "function") return find(node.type(node.props), predicate);
    for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
  };
  return { render, find, redirects, listeners, setPathname: value => { pathname = value; }, flush: () => { while (effects.length) effects.shift()(); },
    unmount: () => hooks.forEach(hook => hook?.cleanup?.()), replay: () => { hooks.forEach(hook => hook?.cleanup?.()); hooks.forEach(hook => { if (hook?.effect) hook.cleanup = hook.fn(); }); },
    advance: ms => { clock += ms; for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.fn(); } },
    setAuth: next => { authValue = next; }, setLeads: next => { leadsValue = next; } };
}
async function provider(reader, authValue = auth) {
  const ui = harness("components/admin/LeadsProvider.tsx", { reader, authValue }); ui.render(); ui.flush();
  await ui.render().props.value.ensureList(); await tick(); return ui;
}
module.exports = { harness, loaded, lead, row, api, queries, mutationApi, dashboardApi, auth, tick, deferred, plain, statistics, summary, renderToStaticMarkup, provider };
