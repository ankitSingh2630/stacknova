const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Query } = require("appwrite");
const { dashboardApi: api, types } = require("./helpers/admin.cjs");
const { row, plain } = require("./helpers/admin-ui.cjs");
const config = { databaseId: "test-db", leadsTableId: "test-leads" };
function fixture(failures = {}) {
  const calls = []; const totals = [42, 5, 7, 8, 9, 13];
  const reader = api.createDashboardReader({ config, tablesDB: { listRows: async args => {
    const index = calls.length; calls.push(plain(args)); if (failures[index]) throw failures[index];
    return index === 0 ? { rows: [{ ...row, company: null, notes: null }], total: totals[index] } : { rows: [{ $id: `count-${index}` }], total: totals[index] };
  } } }); return { calls, reader };
}
test("dashboard uses six centralized queries and maps only full recent rows", async () => {
  const { calls, reader } = fixture(); const result = await reader.summary();
  assert.equal(result.ok, true); assert.equal(result.summary.total, 42); assert.equal(result.summary.recent[0].id, row.$id);
  assert.equal(result.summary.recent[0].company, ""); assert.equal(result.summary.recent[0].notes, "");
  assert.deepEqual(plain(result.summary.counts), { New: 5, Contacted: 7, "In Progress": 8, Converted: 9, Closed: 13 });
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[0].queries, [Query.isNull("deletedAt"), Query.orderDesc("$createdAt"), Query.orderDesc("$id"), Query.limit(5)]);
  types.leadStatuses.forEach((status, index) => assert.deepEqual(calls[index + 1].queries, [Query.isNull("deletedAt"), Query.equal("status", status), Query.limit(1), Query.select(["$id"])]));
  for (const call of calls) { assert.equal(call.total, true); assert.equal(call.ttl, 0); assert.equal(call.databaseId, config.databaseId); assert.equal(call.tableId, config.leadsTableId); }
});
test("parallel dashboard failure gives 401 priority and never exposes provider errors", async () => {
  const error = code => Object.assign(new Error("private provider/credentials"), { code });
  const { reader } = fixture({ 1: error(403), 3: error(401) }); const result = await reader.summary();
  assert.equal(result.ok, false); assert.equal(result.kind, "session"); assert.ok(!JSON.stringify(result).includes("private"));
});
test("empty dashboard returns accurate zero counts and empty recent leads", async () => {
  const reader = api.createDashboardReader({ config, tablesDB: { listRows: async () => ({ rows: [], total: 0 }) } });
  const result = await reader.summary(); assert.equal(result.ok, true); assert.equal(result.summary.total, 0);
  assert.ok(Object.values(result.summary.counts).every(total => total === 0)); assert.equal(result.summary.recent.length, 0);
});
test("malformed recent row or count total causes safe summary failure", async () => {
  for (const result of [{ rows: [{ $id: "incomplete" }], total: 1 }, { rows: [], total: "42" }]) {
    const reader = api.createDashboardReader({ config, tablesDB: { listRows: async () => result } });
    assert.equal((await reader.summary()).ok, false);
  }
});
test("dashboard maps five newest active leads and excludes archived rows defensively", async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ ...row, $id: `recent-${index}`, $createdAt: `2026-10-${String(10-index).padStart(2,"0")}T03:30:00.000Z` }));
  let calls = 0;
  const reader = api.createDashboardReader({ config, tablesDB: { listRows: async () => ++calls === 1 ? { rows, total: 42 } : { rows: [], total: 0 } } });
  const result = await reader.summary(); assert.equal(result.ok, true); assert.equal(result.summary.recent.length, 5);
  assert.deepEqual(result.summary.recent.map(lead => lead.id), rows.map(row => row.$id));
  rows[0].deletedAt = "2026-10-10T04:00:00.000Z"; calls = 0;
  const active = await reader.summary(); assert.equal(active.summary.recent.length, 4); assert.equal(active.summary.total, 42);
  assert.equal(typeof reader.open, "undefined");
});

test("missing dashboard configuration makes no SDK calls", async () => {
  let calls = 0; const reader = api.createDashboardReader({ config: { ...config, leadsTableId: "" }, tablesDB: { listRows: async () => { calls++; } } });
  assert.equal((await reader.summary()).ok, false); assert.equal(calls, 0);
});
