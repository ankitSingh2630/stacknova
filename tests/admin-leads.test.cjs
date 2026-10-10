const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Query } = require("appwrite");
const { types, api, format, queries } = require("./helpers/admin.cjs");
const plain = value => JSON.parse(JSON.stringify(value));
const row = {
  $id: "real-row-1", $createdAt: "2026-10-09T03:30:00.000Z", $updatedAt: "2026-10-09T04:30:00.000Z",
  name: "Real Customer", email: "customer@example.com", phone: "+91 9876543210", company: "Example Company",
  service: "Web Development", message: "Please build a website.\nBudget: Not sure yet", source: "StackNova Website",
  status: "New", notes: "First internal note\nSecond line", deletedAt: null,
};
const config = { databaseId: "test-database", leadsTableId: "test-leads" };
function reader({ response = { rows: [row], total: 1 }, listError, detail = row, detailError, configuration = config } = {}) {
  const calls = [];
  const tablesDB = {
    listRows: async params => { calls.push(["list", plain(params)]); if (listError) throw listError; return response; },
    getRow: async params => { calls.push(["get", plain(params)]); if (detailError) throw detailError; return detail; },
  };
  return { api: api.createLeadsReader({ tablesDB, config: configuration }), calls };
}
const error = code => Object.assign(new Error("private table/project/permission response"), { code });

test("row mapper preserves real fields and maps Appwrite IDs/timestamps without custom duplicates", () => {
  assert.deepEqual(plain(api.mapLeadRow(row)), {
    id: row.$id, createdAt: row.$createdAt, updatedAt: row.$updatedAt,
    name: row.name, email: row.email, phone: row.phone, company: row.company,
    service: row.service, message: row.message, source: row.source, status: "New", notes: row.notes, deletedAt: null,
  });
  const mapped = api.mapLeadRow({ ...row, $permissions: ["private permission"], irrelevant: "not mapped" });
  assert.equal(mapped.$permissions, undefined);
  assert.equal(mapped.irrelevant, undefined);
});
test("missing/null company and notes become empty text; no note timeline is fabricated", () => {
  for (const value of [undefined, null, ""]) {
    const mapped = api.mapLeadRow({ ...row, company: value, notes: value });
    assert.equal(mapped.company, "");
    assert.equal(mapped.notes, "");
    assert.equal(Array.isArray(mapped.notes), false);
  }
});
test("deletedAt missing/null/blank becomes null; valid populated timestamp is preserved", () => {
  for (const value of [undefined, null, "", " "]) assert.equal(api.mapLeadRow({ ...row, deletedAt: value }).deletedAt, null);
  const deleted = "2026-10-09T05:30:00.000Z";
  assert.equal(api.mapLeadRow({ ...row, deletedAt: deleted }).deletedAt, deleted);
});
test("all five supported lead statuses are retained exactly", () => {
  for (const status of types.leadStatuses) assert.equal(api.mapLeadRow({ ...row, status }).status, status);
});
test("malformed required and optional rows are rejected instead of fabricated", () => {
  for (const field of ["$id", "$createdAt", "$updatedAt", "name", "email", "phone", "service", "message", "source", "status"]) {
    for (const value of [undefined, null, "", 123, []]) assert.throws(() => api.mapLeadRow({ ...row, [field]: value }), field);
  }
  for (const change of [{ status: "Unknown" }, { $id: "../private" }, { $createdAt: "not-a-date" }, { $updatedAt: "invalid" },
    { company: {} }, { notes: [] }, { deletedAt: "not-a-date" }]) assert.throws(() => api.mapLeadRow({ ...row, ...change }));
  for (const invalid of [null, [], "row"]) assert.throws(() => api.mapLeadRow(invalid));
});
test("listRows uses exact approved query array and preserves total beyond the batch", async () => {
  const fixture = reader({ response: { rows: [row], total: 137 } });
  const result = await fixture.api.list();
  assert.equal(result.ok, true);
  assert.equal(result.total, 137);
  assert.equal(result.leads.length, 1);
  assert.deepEqual(fixture.calls[0], ["list", { databaseId: config.databaseId, tableId: config.leadsTableId,
    queries: [Query.isNull("deletedAt"), Query.orderDesc("$createdAt"), Query.orderDesc("$id"), Query.limit(5), Query.offset(0)], total: true, ttl: 0 }]);
  assert.equal(queries.LEADS_PAGE_SIZE, 5);
});
test("list results sort newest first without mutating input and exclude populated deletedAt", async () => {
  const rows = [{ ...row, $id: "older", $createdAt: "2026-10-01T00:00:00.000Z" }, row,
    { ...row, $id: "deleted", deletedAt: "2026-10-09T05:00:00.000Z" }];
  const fixture = reader({ response: { rows, total: 3 } });
  const result = await fixture.api.list();
  assert.deepEqual(plain(result.leads.map(item => item.id)), [row.$id, "older"]);
  assert.equal(rows[0].$id, "older");
});
test("empty list is a successful real empty state", async () => {
  const result = await reader({ response: { rows: [], total: 0 } }).api.list();
  assert.deepEqual(plain(result), { ok: true, leads: [], total: 0 });
});
test("read failures are safe and distinguish session 401 from read-access 403", async () => {
  for (const [code, kind, message] of [[401, "session", api.leadsMessages.session], [403, "access", api.leadsMessages.access], [500, "failure", api.leadsMessages.failure]]) {
    const result = await reader({ listError: error(code) }).api.list();
    assert.deepEqual(plain(result), { ok: false, kind, message });
    assert.ok(!JSON.stringify(result).includes("private"));
    assert.equal(result.leads, undefined);
  }
});
test("malformed list response or a malformed row causes safe failure", async () => {
  for (const response of [{ rows: null, total: 0 }, { rows: [row], total: "1" }, { rows: [row], total: 0 },
    { rows: [{ ...row, name: undefined }], total: 1 }]) {
    const result = await reader({ response }).api.list();
    assert.equal(result.ok, false);
    assert.equal(result.message, api.leadsMessages.failure);
  }
});
test("missing database/table configuration never makes requests", async () => {
  for (const field of ["databaseId", "leadsTableId"]) {
    const fixture = reader({ configuration: { ...config, [field]: "" } });
    assert.equal((await fixture.api.list()).ok, false);
    assert.equal((await fixture.api.detail(row.$id)).ok, false);
    assert.equal(fixture.calls.length, 0);
  }
});
test("getRow reads a runtime ID with fixed configured targets", async () => {
  const fixture = reader();
  const result = await fixture.api.detail(row.$id);
  assert.equal(result.ok, true);
  assert.equal(result.lead.id, row.$id);
  assert.deepEqual(fixture.calls, [["get", { databaseId: config.databaseId, tableId: config.leadsTableId, rowId: row.$id }]]);
});
test("missing and invalid runtime IDs never reach getRow", async () => {
  const fixture = reader();
  for (const id of ["", "../row", "$row", "id with spaces", "a".repeat(37)]) {
    assert.equal((await fixture.api.detail(id)).lead, null);
  }
  assert.equal(fixture.calls.length, 0);
});
test("404 and soft-deleted direct rows are unavailable", async () => {
  assert.equal((await reader({ detailError: error(404) }).api.detail(row.$id)).lead, null);
  assert.equal((await reader({ detail: { ...row, deletedAt: "2026-10-09T05:00:00.000Z" } }).api.detail(row.$id)).lead, null);
});
test("detail failures/mismatched IDs/malformed rows never expose data or provider errors", async () => {
  for (const options of [{ detailError: error(403) }, { detailError: error(401) }, { detailError: error(500) },
    { detail: { ...row, $id: "other-row" } }, { detail: { ...row, notes: [] } }]) {
    const result = await reader(options).api.detail(row.$id);
    assert.equal(result.ok, false);
    assert.equal(result.lead, undefined);
    assert.ok(!JSON.stringify(result).includes("private"));
  }
});
test("India calendar filters use actual timestamps, current day and last seven days", () => {
  const now = new Date("2026-10-09T06:00:00.000Z");
  assert.equal(format.matchesDate("2026-10-08T19:00:00.000Z", "today", now), true);
  assert.equal(format.matchesDate("2026-10-08T12:00:00.000Z", "today", now), false);
  assert.equal(format.matchesDate("2026-10-03T00:00:00.000Z", "week", now), true);
  assert.equal(format.matchesDate("2026-10-02T00:00:00.000Z", "week", now), false);
  assert.equal(format.matchesDate("2026-10-10T00:00:00.000Z", "week", now), false);
  assert.equal(format.leadHref(row.$id), "/admin/lead/?id=real-row-1");
  assert.match(format.dateLabel(row.$createdAt, true), /2026/);
});
