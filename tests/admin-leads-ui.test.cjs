const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const {harness, loaded, lead, api, queries, mutationApi, auth, tick, deferred, plain, renderToStaticMarkup, provider} = require("./helpers/admin-ui.cjs");

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
  assert.equal(ui.render().props.value.initialized, false);
  ui.flush(); void ui.render().props.value.ensureList(); assert.equal(calls, 1);
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
  for (let i = 0; i < 3; i++) { ui.render(); ui.flush(); void ui.render().props.value.ensureList(); await tick(); }
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
  for (let i = 0; i < 3; i++) { ui.render(); ui.flush(); void ui.render().props.value.ensureList(); await tick(); }
  assert.equal(checks, 0);
  assert.equal(calls, 1);
});
test("401 at list entry does not refetch when central auth remains authorized", async () => {
  let lists = 0, checks = 0;
  const ui = await provider({ list: async () => { lists++; return { ok: false, kind: "session", message: api.leadsMessages.session }; } },
    { ...auth, recheckSession: async () => { checks++; } });
  for (let i = 0; i < 3; i++) { ui.render(); ui.flush(); void ui.render().props.value.ensureList(); await tick(); }
  assert.equal(lists, 1); assert.equal(checks, 1);
});
test("identity change immediately hides old cache and ignores stale reads", async () => {
  const pending = deferred(); let reads = 0;
  const ui = await provider({ list: async () => ++reads === 1 ? { ok: true, leads: [lead], total: 1 } : pending.promise });
  ui.setAuth({ ...auth, state: { status: "authorized", user: { $id: "other-admin" } } });
  assert.equal(ui.render().props.value.leads.length, 0);
  assert.equal(ui.render().props.value.getLeadState(lead.id).status, "loading");
  ui.flush();
  ui.setAuth({ ...auth, state: { status: "signedOut" } }); ui.render(); ui.flush(); void ui.render().props.value.ensureList();
  pending.resolve({ ok: true, leads: [lead], total: 1 }); await tick();
  assert.equal(ui.render().props.value.leads.length, 0);
});
test("unmounted provider ignores pending database result", async () => {
  const pending = deferred();
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: { list: () => pending.promise } });
  ui.render(); ui.flush(); void ui.render().props.value.ensureList(); ui.unmount();
  pending.resolve({ ok: true, leads: [lead], total: 1 }); await tick();
  assert.equal(ui.render().props.value.leads.length, 0);
});

test("a later manual refresh wins over an older pending list result", async () => {
  const older = deferred(); let reads = 0;
  const newer = { ...lead, id: "newer-row", name: "Latest Customer" };
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: {
    list: async () => ++reads === 1 ? older.promise : { ok: true, leads: [newer], total: 2 },
  } });
  ui.render(); ui.flush(); void ui.render().props.value.ensureList();
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
test("detail uses real runtime ID and continues displaying confirmed notes/timestamps", () => {
  let lookups = 0;
  const value = { ...loaded(), getLeadState: id => { assert.equal(id, lead.id); return { status: "loaded", lead }; }, ensureLead: async id => { assert.equal(id, lead.id); lookups++; } };
  const ui = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: value });
  const html = renderToStaticMarkup(ui.render());
  assert.ok(html.includes(lead.message)); assert.ok(html.includes(lead.notes));
  assert.ok(html.includes(lead.createdAt)); assert.ok(html.includes(lead.updatedAt));
  ui.flush(); assert.equal(lookups, 1);
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
test("direct detail loads independently without waiting for or requesting a list", async () => {
  let reads=0, lists=0;
  const older={...lead,id:"older-row"};
  const store=harness("components/admin/LeadsProvider.tsx",{reader:{list:async()=>{lists++;},detail:async()=>{reads++;return {ok:true,lead:older};}}});
  store.render();store.flush();
  await store.render().props.value.ensureLead(older.id);
  const page=harness("components/admin/LeadDetails.tsx",{id:older.id,leadsValue:store.render().props.value});
  assert.ok(renderToStaticMarkup(page.render()).includes(older.name));
  assert.equal(reads,1);assert.equal(lists,0);
});
test("detail read failure displays safe error and a real refresh action", () => {
  let retries = 0;
  const ui = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: { ...loaded(), getLeadState: () => ({ status: "error", message: api.leadsMessages.failure }),
    ensureLead: async (id,retry) => { if(retry) retries++; } } });
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
test("production runtime has no mock data, create or hard delete; detail URL and Suspense stay static", () => {
  assert.equal(fs.existsSync("components/admin/MockLeadsProvider.tsx"), false);
  assert.equal(fs.existsSync("lib/admin/mock-data.ts"), false);
  for (const directory of ["components/admin", "lib/admin", "app/admin"]) {
    const inspect = path => {
      if (fs.statSync(path).isDirectory()) { for (const entry of fs.readdirSync(path)) inspect(`${path}/${entry}`); return; }
      if (!/\.(tsx?|css)$/.test(path)) return;
      const source = fs.readFileSync(path, "utf8");
      assert.doesNotMatch(source, /MockLeadsProvider|mock-data|useMockLeads|\.deleteRow\(|\.createRow\(/, path);
      if (!path.endsWith("lead-mutations.ts")) assert.doesNotMatch(source, /\.updateRow\(/, path);
    };
    inspect(directory);
  }
  assert.match(fs.readFileSync("app/admin/(workspace)/layout.tsx", "utf8"), /<AdminGuard><LeadsProvider>/);
  assert.match(fs.readFileSync("app/admin/(workspace)/lead/page.tsx", "utf8"), /<Suspense/);
  assert.equal(fs.existsSync("app/admin/leads/[id]"), false);
});
