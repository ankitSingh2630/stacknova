const assert = require("node:assert/strict");
const { test } = require("node:test");
const { harness, loaded, lead, api, mutationApi, auth, tick, deferred, plain, renderToStaticMarkup, statistics, summary } = require("./helpers/admin-ui.cjs");
const updatedAt = "2026-10-09T10:15:00.000Z";
const success = (value, fields) => ({ ok: true, lead: { ...value, ...fields, updatedAt } });
async function store({ leads = [lead], total = leads.length, writer = {}, authValue = auth, detail, reader } = {}) {
  const writes = [];
  const records = new Map([...leads, ...(detail ? [detail] : [])].map(row => [row.id, row]));
  let serverTotal = total;
  const wrapped = {};
  for (const operation of ["status", "notes", "archive"]) wrapped[operation] = async (id, value) => {
    writes.push([operation, id, value]);
    const commit = result => { if (result.ok) { if (result.lead.deletedAt && !records.get(id)?.deletedAt) serverTotal = Math.max(0, serverTotal - 1); records.set(id, result.lead); } else if (result.kind === "notFound") { if (records.has(id)) serverTotal = Math.max(0, serverTotal - 1); records.delete(id); } return result; };
    if (writer[operation]) return commit(await writer[operation](id, value));
    const row = leads.find(item => item.id === id) || detail;
    return commit(success(row, operation === "status" ? { status: value } : operation === "notes" ? { notes: value.trim() }
      : { deletedAt: "2026-10-09T10:00:00.000Z" }));
  };
  const ui = harness("components/admin/LeadsProvider.tsx", { writer: wrapped, authValue,
    dashboardReader: { summary: async () => ({ ok: true, summary: summary([...records.values()].filter(row => !row.deletedAt), serverTotal) }) },
    reader: reader || { list: async query => ({ ok: true, leads: leads.map(row => records.get(row.id)).filter(row => row && !row.deletedAt && (!query.status || row.status === query.status)), total: serverTotal }), detail: async () => ({ ok: true, lead: detail || null }) } });
  ui.render(); ui.flush(); await ui.render().props.value.ensureList(); await tick();
  return { ui, writes, value: () => ui.render().props.value };
}
const failure = (operation, kind = "failure") => ({ ok: false, kind,
  message: kind === "notFound" ? mutationApi.mutationMessages.unavailable : mutationApi.mutationMessages[operation] });

test("status changes only after persistence and uses returned row/timestamp", async () => {
  const pending = deferred();
  const state = await store({ writer: { status: () => pending.promise } });
  const saving = state.value().updateLeadStatus(lead.id, "Contacted");
  assert.equal(state.value().leads[0].status, "New");
  assert.equal(state.value().getMutationState(lead.id).pending, true);
  assert.equal(state.value().getMutationState(lead.id).operation, "status");
  pending.resolve(success(lead, { status: "Contacted", company: "Confirmed Server Company" }));
  assert.equal(await saving, true);
  assert.equal(state.value().leads[0].status, "Contacted");
  assert.equal(state.value().leads[0].company, "Confirmed Server Company");
  assert.equal(state.value().getLeadState(lead.id).lead.updatedAt, updatedAt);
  assert.equal(state.value().getMutationState(lead.id).message, "Lead status updated.");
});

test("provider rejects invalid status and mismatched returned row through the real write helper", async () => {
  let calls = 0;
  const writer = mutationApi.createLeadMutations({ config: { databaseId: "test-db", leadsTableId: "test-leads" }, tablesDB: {
    updateRow: async () => { calls++; return { $id: "wrong-row", $createdAt: lead.createdAt, $updatedAt: updatedAt,
      ...lead, status: "Contacted" }; },
  } });
  const state = await store({ writer });
  assert.equal(await state.value().updateLeadStatus(lead.id, "Arbitrary"), false);
  assert.equal(calls, 0);
  assert.equal(state.value().getMutationState(lead.id).message, "Please select a valid lead status.");
  assert.equal(await state.value().updateLeadStatus(lead.id, "Contacted"), false);
  assert.equal(calls, 1);
  assert.equal(state.value().leads[0].status, "New");
  assert.equal(state.value().getMutationState(lead.id).message, mutationApi.mutationMessages.status);
});

test("unauthorized states cannot invoke any mutation", async () => {
  for (const status of ["loading", "signedOut", "forbidden", "error"]) {
    const state = await store({ authValue: { ...auth, state: { status } } });
    assert.equal(await state.value().updateLeadStatus(lead.id, "Contacted"), false);
    assert.equal(await state.value().addLeadNote(lead.id, "Notes"), false);
    assert.equal(await state.value().softDeleteLead(lead.id), false);
    assert.equal(state.writes.length, 0);
  }
});
test("status success reconciles the server filter and preserves confirmed detail", async () => {
  const state = await store();
  state.value().setFilters({status:"New"}); await tick();
  assert.equal(await state.value().updateLeadStatus(lead.id,"Contacted"),true); await tick();
  assert.equal(state.value().leads.length,0);
  assert.equal(state.value().getLeadState(lead.id).lead.status,"Contacted");
});
for (const operation of ["status", "notes", "archive"]) {
  test(`${operation} failure preserves confirmed lead and allows retry`, async () => {
    let attempts = 0;
    const state = await store({ writer: { [operation]: () => ++attempts === 1 ? failure(operation)
      : success(lead, operation === "status" ? { status: "Contacted" } : operation === "notes" ? { notes: `${lead.notes}\n\nChanged notes` }
        : { deletedAt: "2026-10-09T10:00:00.000Z" }) } });
    const call = () => operation === "status" ? state.value().updateLeadStatus(lead.id, "Contacted")
      : operation === "notes" ? state.value().addLeadNote(lead.id, "Changed notes") : state.value().softDeleteLead(lead.id);
    assert.equal(await call(), false);
    assert.deepEqual(plain(state.value().leads[0]), plain(lead));
    assert.equal(state.value().getMutationState(lead.id).message, mutationApi.mutationMessages[operation]);
    assert.equal(state.value().getMutationState(lead.id).pending, false);
    assert.equal(await call(), true); assert.equal(attempts, 2);
  });
}
test("notes append to confirmed history with two newlines and preserve multiline text", async () => {
  const state = await store();
  await state.value().addLeadNote(lead.id, " First line\nSecond line ");
  assert.equal(state.value().leads[0].notes, `${lead.notes}\n\nFirst line\nSecond line`);
  assert.equal(state.value().leads[0].status, "New");
  await state.value().addLeadNote(lead.id, "Third note");
  assert.equal(state.value().getLeadState(lead.id).lead.notes, `${lead.notes}\n\nFirst line\nSecond line\n\nThird note`);
});

test("first, second, and third note persist only a notes patch built from returned confirmed history", async () => {
  const initial = { ...lead, notes: "" };
  let persisted = { ...initial, $id: initial.id, $createdAt: initial.createdAt, $updatedAt: initial.updatedAt };
  const calls = [];
  const writer = mutationApi.createLeadMutations({ config: { databaseId: "test-db", leadsTableId: "test-leads" }, tablesDB: {
    updateRow: async params => {
      calls.push(JSON.parse(JSON.stringify(params)));
      persisted = { ...persisted, ...params.data, $updatedAt: updatedAt };
      return persisted;
    },
  } });
  const state = await store({ leads: [initial], writer });
  for (const [newNote, expected] of [
    [" Called the client. ", "Called the client."],
    [" Client requested a quotation. ", "Called the client.\n\nClient requested a quotation."],
    [" Follow-up\nScheduled for Monday. ", "Called the client.\n\nClient requested a quotation.\n\nFollow-up\nScheduled for Monday."],
  ]) {
    assert.equal(await state.value().addLeadNote(initial.id, newNote), true);
    assert.deepEqual(calls.at(-1), { databaseId: "test-db", tableId: "test-leads", rowId: initial.id, data: { notes: expected } });
    assert.equal(state.value().getLeadState(initial.id).lead.notes, expected);
    assert.equal(state.value().leads[0].updatedAt, updatedAt);
  }
  assert.equal(calls.length, 3);
});

test("empty/whitespace drafts never reach the write helper and cannot clear persisted history", async () => {
  const state = await store();
  for (const draft of ["", " \n\t "]) {
    assert.equal(await state.value().addLeadNote(lead.id, draft), false);
    assert.equal(state.value().getMutationState(lead.id).message, "Please enter a note before saving.");
  }
  assert.equal(state.writes.length, 0);
  assert.equal(state.value().leads[0].notes, lead.notes);
});

test("append trims outer history whitespace and also works for a detail-only lead", async () => {
  const older = { ...lead, id: "older-row", notes: " \n Historic note.\nSecond line. \n " };
  const state = await store({ detail: older, total: 137 });
  await state.value().ensureLead(older.id);
  assert.equal(await state.value().addLeadNote(older.id, " New note. "), true);
  assert.equal(state.value().getLeadState(older.id).lead.notes, "Historic note.\nSecond line.\n\nNew note.");
  assert.equal(state.value().total, 137);
});

test("failed append keeps confirmed history and retry appends the draft only once", async () => {
  let attempts = 0;
  const writer = mutationApi.createLeadMutations({ config: { databaseId: "test-db", leadsTableId: "test-leads" }, tablesDB: {
    updateRow: async params => {
      if (++attempts === 1) throw new Error("private network error");
      return { ...lead, $id: lead.id, $createdAt: lead.createdAt, $updatedAt: updatedAt, ...params.data };
    },
  } });
  const state = await store({ writer });
  assert.equal(await state.value().addLeadNote(lead.id, "New note."), false);
  assert.equal(state.value().leads[0].notes, lead.notes);
  assert.equal(state.value().getMutationState(lead.id).message, mutationApi.mutationMessages.notes);
  assert.equal(await state.value().addLeadNote(lead.id, "New note."), true);
  assert.equal(state.value().leads[0].notes, `${lead.notes}\n\nNew note.`);
});
test("duplicate notes/archives and status-plus-archive writes on the same lead are blocked", async () => {
  for (const operation of ["notes", "archive", "status"]) {
    const pending = deferred();
    const state = await store({ writer: { [operation]: () => pending.promise } });
    const saving = operation === "notes" ? state.value().addLeadNote(lead.id, "Notes")
      : operation === "status" ? state.value().updateLeadStatus(lead.id, "Contacted") : state.value().softDeleteLead(lead.id);
    assert.equal(await state.value().addLeadNote(lead.id, "Duplicate"), false);
    assert.equal(await state.value().softDeleteLead(lead.id), false);
    assert.equal(await state.value().updateLeadStatus(lead.id, "Closed"), false);
    assert.equal(state.writes.length, 1);
    pending.resolve(success(lead, operation === "notes" ? { notes: "Notes" } : operation === "status" ? { status: "Contacted" }
      : { deletedAt: "2026-10-09T10:00:00.000Z" })); await saving;
  }
});
test("another lead stays independently operable while the first lead is saving", async () => {
  const pending = deferred(); const second = { ...lead, id: "second-row" };
  const state = await store({ leads: [lead, second], writer: { status: id => id === lead.id ? pending.promise : success(second, { status: "Contacted" }) } });
  const saving = state.value().updateLeadStatus(lead.id, "Contacted");
  assert.equal(await state.value().updateLeadStatus(second.id, "Contacted"), true);
  assert.equal(state.value().leads.find(row => row.id === second.id).status, "Contacted");
  assert.equal(state.value().getMutationState(lead.id).pending, true);
  pending.resolve(success(lead, { status: "Contacted" })); await saving;
});
test("archive removes active batch/detail, updates statistics/total, and prevents further writes", async () => {
  const second = { ...lead, id: "second-row" };
  const state = await store({ leads: [lead, second], total: 137 });
  assert.equal(await state.value().softDeleteLead(lead.id), true); await tick();
  assert.equal(state.value().total, 136);
  assert.equal(state.value().leads.length, 1);
  assert.equal(statistics(state.value().leads).New, 1);
  assert.equal(state.value().getLeadState(lead.id).status, "notFound");
  assert.equal(state.value().notice, "Lead archived from active leads.");
  assert.equal(await state.value().softDeleteLead(lead.id), false);
  assert.equal(await state.value().updateLeadStatus(lead.id, "New"), false);
  assert.equal(state.writes.length, 1);
  const list = harness("components/admin/LeadsList.tsx", { leadsValue: state.value() });
  assert.ok(renderToStaticMarkup(list.render()).includes("Lead archived from active leads."));
});
test("archiving detail-only lead refreshes authoritative server total", async () => {
  const older = { ...lead, id: "older-row" };
  const state = await store({ total: 137, detail: older });
  await state.value().ensureLead(older.id);
  assert.equal(await state.value().softDeleteLead(older.id), true); await tick();
  assert.equal(state.value().total, 136);
  assert.equal(state.value().leads.length, 1);
  assert.equal(state.value().getLeadState(older.id).status, "notFound");
});
test("active total cannot become negative even for an inconsistent stubbed count", async () => {
  const state = await store({ total: 0 });
  await state.value().softDeleteLead(lead.id);
  assert.equal(state.value().total, 0);
});

test("batch refresh is blocked during a pending write so an older list cannot restore an archived lead", async () => {
  const pending = deferred(); let reads = 0;
  const state = await store({ writer: { archive: () => pending.promise }, reader: {
    list: async () => { reads++; return { ok: true, leads: [lead], total: 1 }; }, detail: async () => ({ ok: true, lead: null }),
  } });
  const deleting = state.value().softDeleteLead(lead.id);
  await state.value().refreshLeads(); assert.equal(reads, 1);
  pending.resolve(success(lead, { deletedAt: "2026-10-09T10:00:00.000Z" })); await deleting; await tick();
  assert.equal(state.value().leads.length, 0);
  assert.equal(state.value().getLeadState(lead.id).status, "notFound");
});
test("a pending list read prevents writes until an active lead is confirmed", async () => {
  const pending = deferred(); let writes = 0;
  const ui = harness("components/admin/LeadsProvider.tsx", { reader: { list: () => pending.promise }, writer: { archive: () => { writes++; } } });
  ui.render(); ui.flush();
  assert.equal(await ui.render().props.value.softDeleteLead(lead.id), false);
  assert.equal(writes, 0);
  pending.resolve({ ok: true, leads: [lead], total: 1 }); await tick();
});
test("401 clears private caches, rechecks once, and never retries the write/read automatically", async () => {
  let checks = 0;
  const state = await store({ writer: { notes: () => failure("notes", "session") }, authValue: { ...auth, recheckSession: async () => { checks++; } } });
  assert.equal(await state.value().addLeadNote(lead.id, "Draft"), false);
  assert.equal(state.value().leads.length, 0); assert.equal(state.value().total, 0);
  assert.equal(state.value().error, mutationApi.mutationMessages.notes);
  assert.equal(checks, 1);
  await state.value().addLeadNote(lead.id, "Retry without restoring data");
  for (let i = 0; i < 3; i++) { state.ui.render(); state.ui.flush(); await tick(); }
  assert.equal(checks, 1); assert.equal(state.writes.length, 1);
});
test("403 preserves authorized identity and confirmed data with operation-specific feedback", async () => {
  let checks = 0;
  const authValue = { ...auth, recheckSession: async () => { checks++; } };
  const state = await store({ writer: { status: () => failure("status", "access") }, authValue });
  assert.equal(await state.value().updateLeadStatus(lead.id, "Contacted"), false);
  assert.equal(state.value().leads[0].status, "New");
  assert.equal(authValue.state.status, "authorized"); assert.equal(checks, 0);
  assert.equal(state.value().getMutationState(lead.id).message, mutationApi.mutationMessages.status);
});
test("404 removes stale list/detail once and blocks further edits", async () => {
  const state = await store({ writer: { status: () => failure("status", "notFound") } });
  await state.value().updateLeadStatus(lead.id, "Contacted"); await tick();
  assert.equal(state.value().leads.length, 0); assert.equal(state.value().total, 0);
  assert.equal(state.value().getLeadState(lead.id).status, "notFound");
  await state.value().addLeadNote(lead.id, "No longer available"); assert.equal(state.writes.length, 1);
});

test("404 detail-only row reconciles the list total from the server", async () => {
  const older = { ...lead, id: "older-row" };
  const state = await store({ total: 137, detail: older, writer: { notes: () => failure("notes", "notFound") } });
  await state.value().ensureLead(older.id);
  assert.equal(await state.value().addLeadNote(older.id, "Notes"), false); await tick();
  assert.equal(state.value().total, 136);
  assert.equal(state.value().leads.length, 1);
  assert.equal(state.value().getLeadState(older.id).status, "notFound");
});
for (const invalidation of ["signedOut", "forbidden", "identity", "unmount"]) {
  test(`mutation response after ${invalidation} cannot repopulate private caches`, async () => {
    const pending = deferred();
    const state = await store({ writer: { status: () => pending.promise } });
    const saving = state.value().updateLeadStatus(lead.id, "Contacted");
    if (invalidation === "unmount") state.ui.unmount();
    else { state.ui.setAuth({ ...auth, state: invalidation === "identity" ? { status: "authorized", user: { $id: "other-admin" } } : { status: invalidation } }); state.ui.render(); state.ui.flush(); }
    pending.resolve(success(lead, { status: "Contacted" }));
    assert.equal(await saving, false);
    if (invalidation !== "unmount") assert.ok(!state.value().leads.some(row => row.status === "Contacted"));
    else assert.equal(state.value().leads[0].status, "New");
  });
}
test("a 401 from another read invalidates pending mutations as well as read caches", async () => {
  const pending = deferred();
  const state = await store({ writer: { status: () => pending.promise }, reader: {
    list: async () => ({ ok: true, leads: [lead], total: 1 }), detail: async () => ({ ok: false, kind: "session", message: "Unable to load leads." }),
  } });
  const saving = state.value().updateLeadStatus(lead.id, "Contacted");
  await state.value().ensureLead("older-row");
  pending.resolve(success(lead, { status: "Contacted" }));
  assert.equal(await saving, false); assert.equal(state.value().leads.length, 0);
  assert.equal(state.value().hasPendingMutations, false);
});
test("status and notes returned as already archived are removed from active display", async () => {
  const state = await store({ writer: { status: () => success(lead, { status: "Contacted", deletedAt: "2026-10-09T10:00:00.000Z" }) } });
  assert.equal(await state.value().updateLeadStatus(lead.id, "Contacted"), false);
  assert.equal(state.value().leads.length, 0);
  assert.equal(state.value().getLeadState(lead.id).status, "notFound");
});

function detail(value) {
  return harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: {
    ...loaded(), getLeadState: () => ({ status: "loaded", lead }), ensureLead: async () => {}, ...value,
  } });
}
test("status selector calls only provider method and displays saving feedback", () => {
  const calls = [];
  const ui = detail({ updateLeadStatus: async (...args) => { calls.push(args); } });
  const select = ui.find(ui.render(), node => node.type === "select");
  select.props.onChange({ target: { value: "Contacted" } });
  assert.deepEqual(calls, [[lead.id, "Contacted"]]);
  ui.setLeads({ ...loaded(), getLeadState: () => ({ status: "loaded", lead }), ensureLead: async () => {},
    getMutationState: () => ({ operation: "status", pending: true, message: "", success: false }) });
  assert.equal(ui.find(ui.render(), node => node.type === "select").props.disabled, true);
  assert.match(renderToStaticMarkup(ui.render()), /Saving status/);
});
test("notes input starts empty with history displayed separately and failed save retains draft", async () => {
  const calls = [];
  const ui = detail({ addLeadNote: async (...args) => { calls.push(args); return false; } });
  assert.equal(ui.find(ui.render(), node => node.type === "textarea").props.value, "");
  assert.ok(renderToStaticMarkup(ui.render()).includes(lead.notes));
  assert.match(renderToStaticMarkup(ui.render()), /Add a note/);
  ui.render(); ui.flush();
  ui.find(ui.render(), node => node.type === "textarea").props.onChange({ target: { value: " New draft\nSecond line " } });
  ui.find(ui.render(), node => node.type === "form").props.onSubmit({ preventDefault() {} });
  await tick();
  assert.deepEqual(calls, [[lead.id, " New draft\nSecond line "]]);
  assert.equal(ui.find(ui.render(), node => node.type === "textarea").props.value, " New draft\nSecond line ");
  ui.setLeads({ ...loaded(), getLeadState: () => ({ status: "loaded", lead }), ensureLead: async () => {},
    getMutationState: () => ({ operation: "notes", pending: false, message: mutationApi.mutationMessages.notes, success: false }) });
  assert.ok(renderToStaticMarkup(ui.render()).includes(mutationApi.mutationMessages.notes));
  assert.equal(ui.find(ui.render(), node => node.type === "textarea").props.value, " New draft\nSecond line ");
  ui.find(ui.render(), node => node.type === "textarea").props.onChange({ target: { value: "" } });
  assert.equal(ui.find(ui.render(), node => node.type === "button" && node.props.type === "submit").props.disabled, true);
});

test("successful add clears draft only after confirmation and renders updated history", async () => {
  const pending = deferred();
  const ui = detail({ addLeadNote: () => pending.promise });
  ui.find(ui.render(), node => node.type === "textarea").props.onChange({ target: { value: "New note.\nSecond line." } });
  ui.find(ui.render(), node => node.type === "form").props.onSubmit({ preventDefault() {} });
  await tick();
  assert.equal(ui.find(ui.render(), node => node.type === "textarea").props.value, "New note.\nSecond line.");
  pending.resolve(true); await tick();
  const confirmed = { ...lead, notes: `${lead.notes}\n\nNew note.\nSecond line.` };
  ui.setLeads({ ...loaded(), getLeadState: () => ({ status: "loaded", lead: confirmed }), ensureLead: async () => {} });
  assert.equal(ui.find(ui.render(), node => node.type === "textarea").props.value, "");
  assert.ok(renderToStaticMarkup(ui.render()).includes(confirmed.notes));
});

test("empty Add Note input cannot submit or call provider", async () => {
  let calls = 0;
  const ui = detail({ addLeadNote: async () => { calls++; return true; } });
  for (const draft of ["", " \n\t "]) {
    ui.find(ui.render(), node => node.type === "textarea").props.onChange({ target: { value: draft } });
    assert.equal(ui.find(ui.render(), node => node.type === "button" && node.props.type === "submit").props.disabled, true);
    ui.find(ui.render(), node => node.type === "form").props.onSubmit({ preventDefault() {} });
    await tick();
  }
  assert.equal(calls, 0);
});
test("all mutation controls for the current lead disable while saving notes or archiving", () => {
  for (const operation of ["notes", "archive"]) {
    const ui = detail({ getMutationState: () => ({ operation, pending: true, message: "", success: false }) });
    for (const type of ["select", "textarea"]) assert.equal(ui.find(ui.render(), node => node.type === type).props.disabled, true);
    assert.equal(ui.find(ui.render(), node => node.type === "button" && node.props.type === "submit").props.disabled, true);
    assert.match(renderToStaticMarkup(ui.render()), operation === "notes" ? /Saving note/ : /Archiving/);
  }
});
test("archive requires confirmation, describes retained data, and redirects only on confirmed success", async () => {
  for (const succeeded of [true, false]) {
    let calls = 0;
    const ui = detail({ softDeleteLead: async id => { assert.equal(id, lead.id); calls++; return succeeded; } });
    const tree = ui.render(); const dialog = ui.find(tree, node => node.type === "dialog");
    dialog.ref.current = { showModal() {}, close() {} };
    const open = ui.find(ui.render(), node => node.type === "button" && !node.props.type && [node.props.children].flat(Infinity).includes("Archive Lead"));
    open.props.onClick(); assert.equal(calls, 0);
    assert.ok(renderToStaticMarkup(ui.render()).includes("does not permanently delete"));
    const confirmation = ui.find(ui.render(), node => node.type === "dialog");
    const buttons = confirmation.props.children.flat(Infinity).find(node => node?.props?.className === "dialogActions").props.children;
    buttons[1].props.onClick(); await tick();
    assert.equal(calls, 1);
    assert.deepEqual(Array.from(ui.redirects), succeeded ? ["/admin/leads/"] : []);
  }
});
test("archive cancellation does not call a mutation", () => {
  let calls = 0;
  const ui = detail({ softDeleteLead: async () => { calls++; } });
  const dialog = ui.find(ui.render(), node => node.type === "dialog"); dialog.ref.current = { close() {} };
  const buttons = dialog.props.children.flat(Infinity).find(node => node?.props?.className === "dialogActions").props.children;
  buttons[0].props.onClick(); assert.equal(calls, 0);
});
test("refresh controls are disabled during writes without blocking another lead's mutation UI", async () => {
  const pending = deferred();
  const state = await store({ writer: { notes: () => pending.promise } });
  await state.value().ensureDashboard();
  const saving = state.value().addLeadNote(lead.id, "Notes");
  for (const path of ["components/admin/Dashboard.tsx", "components/admin/LeadsList.tsx"]) {
    const ui = harness(path, { leadsValue: state.value() });
    const button = ui.find(ui.render(), node => node.type === "button" && node.props.children === "Refresh leads");
    assert.equal(button.props.disabled, true);
  }
  pending.resolve(success(lead, { notes: "Notes" })); await saving;
});
