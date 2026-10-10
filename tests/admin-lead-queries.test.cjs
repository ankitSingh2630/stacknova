const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Query } = require("appwrite");
const { queries: api, api: reads } = require("./helpers/admin.cjs");
const { row, plain } = require("./helpers/admin-ui.cjs");
const config = { databaseId: "test-db", leadsTableId: "test-leads" };
const base = [Query.isNull("deletedAt"), Query.orderDesc("$createdAt"), Query.orderDesc("$id"), Query.limit(5), Query.offset(0)];
test("initial page has active-only/newest/ID-order/limit/offset queries and exact fresh totals", async () => {
  const calls = [];
  const reader = reads.createLeadsReader({ config, tablesDB: { listRows: async args => { calls.push(plain(args)); return { rows: [row], total: 137 }; } } });
  const result = await reader.list();
  assert.equal(result.ok, true); assert.equal(result.total, 137);
  assert.deepEqual(calls[0], { databaseId: config.databaseId, tableId: config.leadsTableId, queries: base, total: true, ttl: 0 });
});
test("later numbered pages use offset with fixed size five", () => {
  for (const page of [1, 2, 3, 27]) assert.equal(api.buildLeadQueries({ page }).at(-1), Query.offset((page - 1) * 5));
  assert.equal(api.LEADS_PAGE_SIZE, 5); assert.equal(api.SEARCH_DEBOUNCE_MS, 400);
});
test("invalid page values normalize safely to page one", () => {
  for (const page of [0, -1, 1.5, NaN, Infinity, "3", null, Number.MAX_SAFE_INTEGER]) {
    assert.equal(api.normalizeLeadQuery({ page }).page, 1);
    assert.equal(api.buildLeadQueries({ page }).at(-1), Query.offset(0));
  }
});
test("totalPages and nearest valid page handle empty and incomplete last pages", () => {
  for (const [total, pages] of [[0, 0], [1, 1], [5, 1], [6, 2], [137, 28]]) assert.equal(api.totalPages(total), pages);
  assert.equal(api.nearestPage(3, 10), 2); assert.equal(api.nearestPage(5, 0), 1);
});
test("all/blank search omits the OR entirely", () => {
  for (const search of ["", " \n\t "]) assert.deepEqual(plain(api.buildLeadQueries({ search })), base);
});
test("trimmed search contains all four existing fields without changing case", () => {
  const expected = Query.or(["name", "email", "phone", "company"].map(field => Query.contains(field, "AnKiT")));
  assert.deepEqual(plain(api.buildLeadQueries({ search: " AnKiT " })), [base[0], expected, ...base.slice(1)]);
});
for (const [status, service, search] of [["New", "", ""], ["", "Web Development", ""], ["New", "", "ankit"],
  ["New", "Web Development", ""], ["New", "Web Development", "ankit"]]) {
  test(`combines status=${status || "All"}, service=${service || "All"}, search=${search || "none"}`, () => {
    const optional = [];
    if (status) optional.push(Query.equal("status", status)); if (service) optional.push(Query.equal("service", service));
    if (search) optional.push(Query.or(["name", "email", "phone", "company"].map(field => Query.contains(field, search))));
    assert.deepEqual(plain(api.buildLeadQueries({ status, service, search })), [base[0], ...optional, ...base.slice(1)]);
  });
}
test("invalid status/service/date/search never reaches TablesDB", async () => {
  let calls = 0;
  const reader = reads.createLeadsReader({ config, tablesDB: { listRows: async () => { calls++; } } });
  for (const query of [{ status: "Unknown" }, { service: "Arbitrary" }, { date: "year" }, { search: null }, { search: "x".repeat(201) }]) {
    assert.equal((await reader.list(query)).ok, false);
  }
  assert.equal(calls, 0);
});
for (const [range, instant, start, end] of [
  ["today", "2026-10-09T18:29:59Z", "2026-10-08T18:30:00.000Z", "2026-10-09T18:30:00.000Z"],
  ["today", "2026-10-09T18:30:00Z", "2026-10-09T18:30:00.000Z", "2026-10-10T18:30:00.000Z"],
  ["week", "2026-01-01T05:00:00Z", "2025-12-25T18:30:00.000Z", "2026-01-01T18:30:00.000Z"],
]) test(`${range} uses India midnight as an absolute ISO instant for ${instant}`, () => {
  const now = new Date(instant);
  assert.deepEqual(plain(api.indiaDateBounds(range, now)), { startISO: start, endISO: end });
  assert.deepEqual(plain(api.buildLeadQueries({ date: range }, now)), [base[0], Query.greaterThanEqual("$createdAt", start), Query.lessThan("$createdAt", end), ...base.slice(1)]);
});
test("supported-ID-order rejection falls back once without schema/index changes", async () => {
  const calls = [];
  const reader = reads.createLeadsReader({ config, tablesDB: { listRows: async args => {
    calls.push(plain(args)); if (calls.length === 1) throw Object.assign(new Error('Ordering by "$id" is not supported'), { code: 400 });
    return { rows: [row], total: 1 };
  } } });
  const result = await reader.list(); assert.equal(result.ok, true); assert.match(result.warning, /secondary ID ordering/);
  assert.equal(calls.length, 2); assert.ok(!calls[1].queries.includes(Query.orderDesc("$id")));
  await reader.list(); assert.equal(calls.length, 3); assert.ok(!calls[2].queries.includes(Query.orderDesc("$id")));
});
test("missing-index/generic/auth errors never trigger guessed order fallbacks", async () => {
  for (const [code, message] of [[400, 'Missing index for ordering "$id"'], [400, "Invalid filters"], [403, "Ordering by $id is not supported"]]) {
    let calls = 0;
    const reader = reads.createLeadsReader({ config, tablesDB: { listRows: async () => { calls++; throw Object.assign(new Error(message), { code }); } } });
    assert.equal((await reader.list()).ok, false); assert.equal(calls, 1);
  }
});
test("page read rejects excess rows, malformed rows and unsafe totals", async () => {
  for (const result of [{ rows: Array(6).fill(row), total: 137 }, { rows: [{ ...row, name: null }], total: 1 }, { rows: [], total: -1 }]) {
    const reader = reads.createLeadsReader({ config, tablesDB: { listRows: async () => result } });
    assert.equal((await reader.list()).ok, false);
  }
});
