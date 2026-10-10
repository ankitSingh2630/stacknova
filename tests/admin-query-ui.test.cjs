const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const { harness, loaded, lead, row, auth, tick, deferred, plain, summary, renderToStaticMarkup } = require("./helpers/admin-ui.cjs");
const ok = (leads = [lead], total = 20) => ({ ok: true, leads, total });
const readError = kind => ({ ok: false, kind, message: "Unable to load leads right now." });
async function start(options = {}) {
  const calls = [];
  const reader = options.reader || { list: async query => { calls.push(plain(query)); return ok(); }, detail: async () => ok([lead], 1) };
  const ui = harness("components/admin/LeadsProvider.tsx", { ...options, reader });
  ui.render(); ui.flush(); await ui.render().props.value.ensureList(); await tick();
  return { ui, calls, value: () => ui.render().props.value };
}
const html = value => renderToStaticMarkup(harness("components/admin/LeadsList.tsx", { leadsValue: value }).render());

test("list and dashboard are lazy, centralized, and do not refetch on renders", async () => {
  let lists = 0, dashboards = 0;
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: { list: async () => { lists++; return ok(); } },
    dashboardReader: { summary: async () => { dashboards++; return { ok: true, summary: summary() }; } } });
  ui.render(); ui.flush(); assert.equal(lists, 0); assert.equal(dashboards, 0);
  await ui.render().props.value.ensureList();
  await ui.render().props.value.ensureDashboard();
  for (let i = 0; i < 5; i++) { ui.render(); ui.flush(); await ui.render().props.value.ensureList(); await ui.render().props.value.ensureDashboard(); }
  assert.equal(lists, 1); assert.equal(dashboards, 1);
});
test("search waits 400ms, updates draft immediately, and resets page only when applied", async () => {
  const state = await start(); state.value().setPage(3); await tick();
  state.value().setSearch(" an "); state.ui.advance(250); state.value().setSearch(" AnKiT ");
  assert.equal(state.value().searchDraft, " AnKiT "); assert.equal(state.value().query.page, 3);
  state.ui.advance(399); assert.equal(state.calls.length, 2);
  state.ui.advance(1); await tick();
  assert.equal(state.calls.length, 3); assert.equal(state.calls[2].search, "AnKiT"); assert.equal(state.value().query.page, 1);
  state.value().setPage(2); await tick();
  for (let i = 0; i < 4; i++) { state.ui.render(); state.ui.flush(); state.ui.advance(400); await tick(); }
  assert.equal(state.value().query.page, 2); assert.equal(state.calls.length, 4);
});
test("a pre-render pagination handler cannot bypass a pending search debounce", async () => {
  const state = await start(); const earlier = state.value();
  earlier.setSearch("ankit"); earlier.setPage(2);
  assert.equal(state.calls.length, 1); assert.equal(state.value().query.page, 1);
  state.ui.advance(400); await tick(); assert.equal(state.calls.length, 2);
});
test("whitespace search clears after debounce and never gets lowercased", async () => {
  const state = await start(); state.value().setSearch("ANKIT"); state.ui.advance(400); await tick();
  assert.equal(state.value().query.search, "ANKIT");
  state.value().setSearch(" \n\t "); state.ui.advance(400); await tick();
  assert.equal(state.calls.at(-1).search, ""); assert.equal(state.value().searchPending, false);
});
test("filters stay immediate during debounce and search later applies once with those filters", async () => {
  const state = await start(); state.value().setSearch("AnKiT");
  state.value().setFilters({ status: "New" }); await tick();
  assert.equal(state.calls.length, 2); assert.equal(state.calls[1].search, ""); assert.equal(state.calls[1].status, "New");
  assert.equal(state.value().searchPending, true);
  state.ui.advance(400); await tick();
  assert.equal(state.calls.length, 3); assert.equal(state.calls[2].search, "AnKiT"); assert.equal(state.calls[2].status, "New");
});
test("identity readiness change restarts independent detail reads for the new authorized user", async () => {
  let details = 0;
  const provider = harness("components/admin/LeadsProvider.tsx", { reader: { detail: async () => { details++; return { ok: true, lead }; } } });
  provider.render(); provider.flush();
  const page = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: provider.render().props.value });
  page.render(); page.flush(); await tick(); assert.equal(details, 1);
  provider.setAuth({ ...auth, state: { status: "authorized", user: { $id: "other-admin" } } });
  page.setLeads(provider.render().props.value); page.render(); page.flush(); assert.equal(details, 1);
  provider.flush(); page.setLeads(provider.render().props.value); page.render(); page.flush(); await tick();
  assert.equal(details, 2);
});
for (const filter of [{ status: "Contacted" }, { service: "UI/UX Design" }, { date: "today" }]) {
  test(`changing ${Object.keys(filter)[0]} applies immediately and resets page one`, async () => {
    const state = await start(); state.value().setPage(3); await tick();
    state.value().setFilters(filter); await tick();
    assert.equal(state.calls.at(-1).page, 1); assert.equal(state.value().query.page, 1);
    assert.deepEqual(Object.fromEntries(Object.keys(filter).map(key => [key, state.calls.at(-1)[key]])), filter);
  });
}
test("invalid filters make no read call and remain safe", async () => {
  const state = await start(); state.value().setFilters({ status: "Arbitrary" }); await tick();
  assert.equal(state.calls.length, 1); assert.equal(state.value().error, "Please choose valid lead filters.");
});
test("invalid page normalizes to one before a read", async () => {
  const state = await start(); state.value().setPage(-7); await tick();
  assert.equal(state.calls.at(-1).page, 1);
});
test("older search response cannot overwrite a newer matching query", async () => {
  const older = deferred(); const newest = { ...lead, id: "newest", name: "New Query Result" };
  const state = await start({ reader: { list: query => query.search === "an" ? older.promise : Promise.resolve(ok(query.search === "ankit" ? [newest] : [lead])) } });
  state.value().setSearch("an"); state.ui.advance(400);
  state.value().setSearch("ankit"); state.ui.advance(400); await tick();
  older.resolve(ok([lead], 137)); await tick();
  assert.equal(state.value().leads[0].id, newest.id); assert.equal(state.value().total, 20);
});
test("old page response cannot override a newer filter-reset page", async () => {
  const older = deferred(); const filtered = { ...lead, id: "filtered" };
  const state = await start({ reader: { list: query => query.page === 2 ? older.promise : Promise.resolve(ok(query.status ? [filtered] : [lead])) } });
  state.value().setPage(2); state.value().setFilters({ status: "New" }); await tick();
  older.resolve(ok([lead], 137)); await tick();
  assert.equal(state.value().query.page, 1); assert.equal(state.value().appliedQuery.page, 1); assert.equal(state.value().leads[0].id, filtered.id);
});
test("query updating keeps labelled previous rows and blocks conflicting page clicks", async () => {
  const pending = deferred(); let reads = 0;
  const state = await start({ reader: { list: async () => ++reads === 1 ? ok() : pending.promise } });
  state.value().setPage(2);
  const text = html(state.value()); assert.ok(text.includes(lead.name)); assert.match(text, /Previous results are shown/);
  assert.equal(state.value().appliedQuery.page, 1);
  const list = harness("components/admin/LeadsList.tsx", { leadsValue: state.value() });
  assert.equal(list.find(list.render(), node => node.props?.["aria-label"] === "Next page").props.disabled, true);
  state.value().setPage(3); assert.equal(reads, 2);
  pending.resolve(ok()); await tick(); assert.equal(state.value().appliedQuery.page, 2);
});
test("returning search draft to applied value does not leave an invalidated read stuck", async () => {
  const pending = deferred(); let reads = 0;
  const state = await start({ reader: { list: async () => ++reads === 2 ? pending.promise : ok() } });
  state.value().setPage(2);
  state.value().setSearch("new draft"); state.value().setSearch(""); await tick();
  pending.resolve(ok([lead], 137)); await tick();
  assert.equal(state.value().loading, false); assert.equal(state.value().query.search, ""); assert.equal(state.value().total, 20);
});
test("read retry uses current filters/search/page without resetting them", async () => {
  const calls = []; let failed = false;
  const state = await start({ reader: { list: async query => { calls.push(plain(query)); if (query.status && !failed) { failed = true; return readError("failure"); } return ok(); } } });
  state.value().setSearch("Ankit"); state.ui.advance(400); await tick();
  state.value().setFilters({ status: "New", service: "Web Development", date: "week" }); await tick();
  assert.equal(state.value().error, "Unable to load leads right now.");
  await state.value().refreshLeads(); assert.deepEqual(calls.at(-1), calls.at(-2)); assert.equal(state.value().error, "");
});
test("page correction makes one corrected fetch and returns nearest valid page", async () => {
  const calls = [];
  const state = await start({ reader: { list: async query => { calls.push(query.page); return ok(query.page === 3 ? [] : [lead], 10); } } });
  state.value().setPage(3); await tick();
  assert.deepEqual(calls, [1, 3, 2]); assert.equal(state.value().query.page, 2); assert.equal(state.value().appliedQuery.page, 2);
});
test("a second total change never creates an infinite page-correction loop", async () => {
  const calls = [];
  const state = await start({ reader: { list: async query => { calls.push(query.page); return ok([], calls.length === 1 ? 20 : calls.length === 2 ? 11 : 1); } } });
  state.value().setPage(4); await tick();
  assert.deepEqual(calls, [1, 4, 3]); assert.equal(state.value().query.page, 1); assert.match(state.value().error, /Results changed/);
  await state.value().refreshLeads(); assert.equal(calls.at(-1), 1); assert.equal(calls.length, 4);
});
test("empty database and no matching filters have distinct UI states", async () => {
  const state = await start({ reader: { list: async () => ok([], 0) } });
  assert.match(html(state.value()), /No leads found\./);
  state.value().setFilters({ service: "Other" }); await tick();
  assert.match(html(state.value()), /No leads match your search or filters\./);
  assert.equal(state.value().query.page, 1);
});
test("UI renders server rows directly and global services, without browser filtering/slicing", () => {
  const calls = [];
  const value = { ...loaded([lead], 137), query: { ...loaded().query, search: "server selected", status: "Closed" }, setSearch: input => calls.push(input), setFilters: input => calls.push(input) };
  const list = harness("components/admin/LeadsList.tsx", { leadsValue: value });
  assert.ok(renderToStaticMarkup(list.render()).includes(lead.name));
  assert.match(renderToStaticMarkup(list.render()), /Software Engineering/);
  list.find(list.render(), node => node.type === "input").props.onChange({ target: { value: "AnKiT" } });
  assert.deepEqual(calls, ["AnKiT"]);
  assert.match(renderToStaticMarkup(list.render()), /of 137 leads/);
});
test("archive final page item refetches authoritative total and moves to prior valid page", async () => {
  const records = Array.from({ length: 11 }, (_, index) => ({ ...lead, id: `lead-${index}` })); let archived = false; const calls = [];
  const state = await start({ reader: { list: async query => { calls.push(query.page); const active = archived ? records.slice(0, 10) : records; return ok(active.slice((query.page - 1) * 5, query.page * 5), active.length); } },
    writer: { archive: async id => { archived = true; return { ok: true, lead: { ...records.find(row => row.id === id), deletedAt: "2026-10-10T00:00:00.000Z" } }; } } });
  state.value().setPage(3); await tick();
  assert.equal(await state.value().softDeleteLead("lead-10"), true); await tick();
  assert.deepEqual(calls, [1, 3, 3, 2]); assert.equal(state.value().total, 10); assert.equal(state.value().query.page, 2);
  assert.equal(state.value().leads.length, 5); assert.equal(state.value().getLeadState("lead-10").status, "notFound");
});
test("confirmed status write remains successful if subsequent list refresh fails", async () => {
  let reads = 0;
  const state = await start({ reader: { list: async () => ++reads === 1 ? ok() : readError("access") },
    writer: { status: async () => ({ ok: true, lead: { ...lead, status: "Contacted", updatedAt: "2026-10-10T01:00:00.000Z" } }) } });
  assert.equal(await state.value().updateLeadStatus(lead.id, "Contacted"), true); await tick();
  assert.equal(state.value().getMutationState(lead.id).success, true);
  assert.equal(state.value().getMutationState(lead.id).message, "Lead status updated.");
  assert.equal(state.value().getLeadState(lead.id).lead.status, "Contacted"); assert.equal(state.value().error, "Unable to load leads right now.");
});
test("status reconciliation uses filtered server total and refreshes exact dashboard counts", async () => {
  let confirmed = lead;
  const state = await start({ reader: { list: async query => ok(!query.status || query.status === confirmed.status ? [confirmed] : [], !query.status || query.status === confirmed.status ? 1 : 0) },
    dashboardReader: { summary: async () => ({ ok: true, summary: summary([confirmed], 1) }) },
    writer: { status: async (id, status) => { confirmed = { ...confirmed, status, updatedAt: "2026-10-10T02:00:00.000Z" }; return { ok: true, lead: confirmed }; } } });
  await state.value().ensureDashboard(); state.value().setFilters({ status: "New" }); await tick();
  assert.equal(state.value().total, 1);
  await state.value().updateLeadStatus(lead.id, "Contacted"); await tick();
  assert.equal(state.value().total, 0); assert.equal(state.value().leads.length, 0);
  assert.equal(state.value().getLeadState(lead.id).lead.status, "Contacted");
  assert.equal(state.value().dashboard.summary.counts.New, 0); assert.equal(state.value().dashboard.summary.counts.Contacted, 1);
});
test("confirmed archive remains successful and unavailable if refresh fails", async () => {
  let reads = 0;
  const state = await start({ reader: { list: async () => ++reads === 1 ? ok() : readError("failure") },
    writer: { archive: async () => ({ ok: true, lead: { ...lead, deletedAt: "2026-10-10T01:00:00.000Z" } }) } });
  assert.equal(await state.value().softDeleteLead(lead.id), true); await tick();
  assert.equal(state.value().getLeadState(lead.id).status, "notFound"); assert.equal(state.value().getMutationState(lead.id).success, true);
  assert.equal(state.value().leads.length, 0); assert.ok(state.value().error);
});
test("status/archive refresh loaded dashboard; notes do not query or reset page", async () => {
  let summaries = 0, lists = 0;
  const state = await start({ reader: { list: async () => { lists++; return ok(); } },
    dashboardReader: { summary: async () => { summaries++; return { ok: true, summary: summary() }; } }, writer: {
      notes: async (id, notes) => ({ ok: true, lead: { ...lead, notes, updatedAt: "2026-10-10T01:00:00.000Z" } }),
      status: async () => ({ ok: true, lead: { ...lead, status: "Contacted" } }),
      archive: async () => ({ ok: true, lead: { ...lead, deletedAt: "2026-10-10T01:00:00.000Z" } }),
    } });
  await state.value().ensureDashboard(); state.value().setPage(3); await tick();
  const before = lists;
  assert.equal(await state.value().addLeadNote(lead.id, "New note"), true); await tick();
  assert.equal(lists, before); assert.equal(summaries, 1); assert.equal(state.value().query.page, 3);
  await state.value().updateLeadStatus(lead.id, "Contacted"); await tick(); assert.equal(summaries, 2);
  await state.value().softDeleteLead(lead.id); await tick(); assert.equal(summaries, 3);
});
test("older list response cannot restore a lead after confirmed archive", async () => {
  const older = deferred(); let reads = 0;
  const state = await start({ reader: { list: async () => ++reads === 1 ? ok() : reads === 2 ? older.promise : ok([], 0) },
    writer: { archive: async () => ({ ok: true, lead: { ...lead, deletedAt: "2026-10-10T00:00:00.000Z" } }) } });
  const refresh = state.value().refreshLeads();
  await state.value().softDeleteLead(lead.id); await tick();
  older.resolve(ok()); await refresh;
  assert.equal(state.value().leads.length, 0); assert.equal(state.value().total, 0);
});
test("query changes queued during writes use latest query after per-lead locks settle", async () => {
  const pending = deferred();
  const state = await start({ writer: { notes: () => pending.promise } });
  const saving = state.value().addLeadNote(lead.id, "Note");
  state.value().setSearch("Ankit"); state.ui.advance(400); state.value().setFilters({ status: "New", service: "Other" });
  assert.equal(state.calls.length, 1);
  pending.resolve({ ok: true, lead: { ...lead, notes: `${lead.notes}\n\nNote` } }); await saving; await tick();
  assert.equal(state.calls.length, 2); assert.equal(state.calls[1].search, "Ankit"); assert.equal(state.calls[1].service, "Other");
});
test("401 clears all private state and rechecks once without automatic retry loops", async () => {
  let reads = 0, checks = 0;
  const state = await start({ authValue: { ...auth, recheckSession: async () => { checks++; } }, reader: { list: async () => ++reads === 1 ? ok() : readError("session") } });
  await state.value().ensureDashboard(); await state.value().refreshLeads();
  assert.equal(state.value().leads.length, 0); assert.equal(state.value().total, 0); assert.equal(state.value().dashboard.summary, null);
  assert.equal(state.value().getLeadState(lead.id).status, "error");
  for (let i = 0; i < 4; i++) { state.ui.render(); state.ui.flush(); await state.value().ensureList(); await state.value().ensureDashboard(); }
  assert.equal(checks, 1); assert.equal(reads, 2);
});
test("403 keeps authorized session and safe access state without auth rechecks", async () => {
  let checks = 0;
  const state = await start({ authValue: { ...auth, recheckSession: async () => { checks++; } }, reader: { list: async () => readError("access") } });
  assert.ok(state.value().error); assert.equal(checks, 0); assert.equal(auth.state.status, "authorized");
});
test("a proven read recovery permits one controlled recheck for a later session failure", async () => {
  let checks = 0, reads = 0;
  const state = await start({ authValue: { ...auth, recheckSession: async () => { checks++; } },
    reader: { list: async () => ++reads % 2 ? ok() : readError("session") } });
  await state.value().refreshLeads(); assert.equal(checks, 1);
  await state.value().refreshLeads(); assert.equal(state.value().error, "");
  await state.value().refreshLeads(); assert.equal(checks, 2);
  for (let i = 0; i < 3; i++) { state.ui.render(); state.ui.flush(); await state.value().ensureList(); }
  assert.equal(checks, 2); assert.equal(reads, 4);
});
for (const loss of ["signedOut", "forbidden", "identity", "unmount"]) {
  test(`stale search response after ${loss} cannot repopulate private results`, async () => {
    const pending = deferred();
    const state = await start({ reader: { list: query => query.search ? pending.promise : Promise.resolve(ok()) } });
    state.value().setSearch("private search"); state.ui.advance(400);
    if (loss === "unmount") state.ui.unmount();
    else { state.ui.setAuth({ ...auth, state: loss === "identity" ? { status: "authorized", user: { $id: "other-admin" } } : { status: loss } }); state.ui.render(); state.ui.flush(); }
    pending.resolve(ok([{ ...lead, name: "Stale Private Result" }], 137)); await tick();
    assert.ok(!state.value().leads.some(row => row.name === "Stale Private Result"));
  });
}
test("dashboard uses full totals independently of list filters and calculates Open Pipeline locally", () => {
  const value = loaded([lead], 2); value.dashboard.summary = { ...summary(), total: 137, counts: { New: 40, Contacted: 30, "In Progress": 20, Converted: 25, Closed: 22 } };
  const ui = harness("components/admin/Dashboard.tsx", { leadsValue: value }); const text = renderToStaticMarkup(ui.render());
  assert.ok(text.includes("137</p>")); assert.match(text, /90 active leads require follow-up/); assert.ok(!text.includes("loaded batch"));
});
test("Review requests recent open leads only when selected and never on ordinary renders", () => {
  let calls = 0; const value = { ...loaded(), ensureOpenLeads: async () => { calls++; } };
  const ui = harness("components/admin/Dashboard.tsx", { leadsValue: value }); ui.render(); ui.flush(); assert.equal(calls, 0);
  ui.find(ui.render(), node => node.type === "button" && node.props.children === "Review").props.onClick();
  ui.render(); ui.flush(); assert.equal(calls, 1);
  for (let i = 0; i < 4; i++) { ui.render(); ui.flush(); } assert.equal(calls, 1);
  assert.match(renderToStaticMarkup(ui.render()), /Recent Open Leads/);
});
test("dashboard and recent-open responses after logout cannot restore private summaries", async () => {
  const dashboard = deferred(), open = deferred();
  const state = await start({ dashboardReader: { summary: () => dashboard.promise, open: () => open.promise } });
  const reading = state.value().ensureDashboard(), reviewing = state.value().ensureOpenLeads();
  state.ui.setAuth({ ...auth, state: { status: "signedOut" } }); state.ui.render(); state.ui.flush();
  dashboard.resolve({ ok: true, summary: summary() }); open.resolve(ok([lead], 1)); await reading; await reviewing;
  assert.equal(state.value().dashboard.summary, null); assert.equal(state.value().openLeads.leads.length, 0);
});
test("Strict Mode replay restarts invalidated pending reads without sticking in loading", async () => {
  const old = deferred(); let calls = 0;
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: { list: async () => ++calls === 1 ? old.promise : ok() } });
  ui.render(); ui.flush(); const initial = ui.render().props.value.ensureList();
  ui.replay(); await tick(); old.resolve(ok([{ ...lead, name: "Old Strict Response" }], 137)); await initial;
  assert.equal(ui.render().props.value.loading, false); assert.equal(ui.render().props.value.leads[0].name, lead.name); assert.equal(calls, 2);
});
test("admin runtime has no full-text dependency or latest-100 list logic", () => {
  const sources = ["lib/admin/lead-queries.ts", "lib/admin/dashboard.ts", "components/admin/LeadsProvider.tsx", "components/admin/LeadsList.tsx"].map(path => fs.readFileSync(path, "utf8"));
  for (const source of sources) assert.doesNotMatch(source, /Query\.search\(|Query\.limit\(100\)|leadBatchLimit|batchNotice\(|fulltext/);
  assert.doesNotMatch(sources[3], /(?:leads|visible)\.filter\(|(?:leads|visible)\.slice\(|toLowerCase\(|matchesDate/);
  assert.doesNotMatch(sources[1], /\.createRow\(|\.updateRow\(|\.deleteRow\(/);
});
