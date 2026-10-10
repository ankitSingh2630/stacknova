const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const { types, api: reads, mutationApi: api } = require("./helpers/admin.cjs");
const row = {
  $id: "lead-1", $createdAt: "2026-10-09T00:00:00.000Z", $updatedAt: "2026-10-09T01:00:00.000Z",
  name: "Example Customer", email: "customer@example.com", phone: "+91 9876543210", company: "",
  service: "Web Development", message: "Project requirements", source: "StackNova Website", status: "New", notes: "Confirmed notes", deletedAt: null,
};
const config = { databaseId: "test-database", leadsTableId: "test-leads" };
const now = () => new Date("2026-10-09T05:30:00.000Z");
const plain = value => JSON.parse(JSON.stringify(value));
const failure = code => Object.assign(new Error("private Appwrite permission response / project / token"), { code });
function fixture({ error, returned, configuration = config } = {}) {
  const calls = [];
  const writer = api.createLeadMutations({ config: configuration, now, tablesDB: {
    updateRow: async params => { calls.push(plain(params)); if (error) throw error;
      return returned || { ...row, ...params.data, $updatedAt: "2026-10-09T06:00:00.000Z" }; },
  } });
  return { writer, calls };
}
test("all canonical statuses use exactly one field and the correct row ID", async () => {
  const { writer, calls } = fixture();
  for (const status of types.leadStatuses) {
    const result = await writer.status(row.$id, status);
    assert.equal(result.ok, true); assert.equal(result.lead.status, status);
    assert.deepEqual(calls.at(-1), { databaseId: config.databaseId, tableId: config.leadsTableId, rowId: row.$id, data: { status } });
  }
});
test("invalid/arbitrary status is rejected before any updateRow call", async () => {
  const { writer, calls } = fixture();
  for (const value of ["Unknown", "new", " Contacted ", "", null, undefined, {}, ["New"], 1]) {
    const result = await writer.status(row.$id, value);
    assert.equal(result.ok, false); assert.equal(result.kind, "validation");
    assert.equal(result.message, "Please select a valid lead status.");
  }
  assert.equal(calls.length, 0);
});
test("notes trims outer whitespace, preserves multiline content, and sends only notes", async () => {
  const { writer, calls } = fixture();
  const result = await writer.notes(row.$id, " \n First line\nSecond line \n ");
  assert.equal(result.ok, true); assert.equal(result.lead.notes, "First line\nSecond line");
  assert.deepEqual(calls[0].data, { notes: "First line\nSecond line" });
});
test("empty/whitespace notes are rejected without an updateRow call", async () => {
  for (const notes of ["", " \n\t "]) {
    const { writer, calls } = fixture();
    const result = await writer.notes(row.$id, notes);
    assert.equal(result.ok, false); assert.equal(result.kind, "validation");
    assert.equal(result.message, "Please enter a note before saving.");
    assert.equal(calls.length, 0);
  }
});
test("notes rejects object/array/non-string inputs without accepting a full Lead payload", async () => {
  const { writer, calls } = fixture();
  for (const value of [row, [], null, undefined, 1]) assert.equal((await writer.notes(row.$id, value)).ok, false);
  assert.equal(calls.length, 0);
});
test("soft delete is one updateRow patch containing only an ISO deletedAt timestamp", async () => {
  const { writer, calls } = fixture();
  const result = await writer.archive(row.$id);
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], { databaseId: config.databaseId, tableId: config.leadsTableId, rowId: row.$id,
    data: { deletedAt: "2026-10-09T05:30:00.000Z" } });
  assert.equal(result.lead.deletedAt, calls[0].data.deletedAt);
});
test("returned mapped row supplies real updatedAt and all confirmed fields", async () => {
  const updated = { ...row, status: "Contacted", company: "Server Company", notes: "Server notes", $updatedAt: "2026-10-09T07:15:00.000Z" };
  const { writer } = fixture({ returned: updated });
  const result = await writer.status(row.$id, "Contacted");
  assert.deepEqual(plain(result.lead), plain(reads.mapLeadRow(updated)));
  assert.equal(result.lead.updatedAt, updated.$updatedAt);
});
for (const operation of ["status", "notes", "archive"]) {
  test(`${operation} rejects a mismatched row ID and malformed response safely`, async () => {
    const value = operation === "status" ? "Contacted" : "Updated notes";
    for (const returned of [{ ...row, $id: "wrong-row" }, { ...row, name: null }, { ...row, $updatedAt: "invalid" }]) {
      const { writer } = fixture({ returned });
      const result = await writer[operation](row.$id, value);
      assert.equal(result.ok, false); assert.equal(result.message, api.mutationMessages[operation]);
      assert.equal(result.lead, undefined);
    }
  });
  test(`${operation} maps 401/403/404/network failures to safe feedback`, async () => {
    for (const [error, kind] of [[failure(401), "session"], [failure(403), "access"], [failure(404), "notFound"], [failure(500), "failure"], [new TypeError("private network URL"), "failure"]]) {
      const { writer } = fixture({ error });
      const result = await writer[operation](row.$id, operation === "status" ? "Contacted" : "Updated notes");
      assert.equal(result.ok, false); assert.equal(result.kind, kind);
      assert.equal(result.message, kind === "notFound" ? api.mutationMessages.unavailable : api.mutationMessages[operation]);
      assert.ok(!JSON.stringify(result).includes("private"));
    }
  });
}
test("a returned row that does not confirm the requested field cannot produce success", async () => {
  const { writer } = fixture({ returned: row });
  assert.equal((await writer.status(row.$id, "Contacted")).ok, false);
  assert.equal((await writer.notes(row.$id, "Changed")).ok, false);
  assert.equal((await writer.archive(row.$id)).ok, false);
});
test("invalid IDs/configuration never reach updateRow", async () => {
  for (const configuration of [config, { ...config, databaseId: "" }, { ...config, leadsTableId: "" }]) {
    const { writer, calls } = fixture({ configuration });
    const id = configuration === config ? "../invalid" : row.$id;
    for (const [method, value] of [["status", "Contacted"], ["notes", "Notes"], ["archive", undefined]])
      assert.equal((await writer[method](id, value)).ok, false);
    assert.equal(calls.length, 0);
  }
});
test("admin runtime contains no create/hard-delete calls and updates are centralized", () => {
  const inspect = path => {
    if (fs.statSync(path).isDirectory()) { for (const name of fs.readdirSync(path)) inspect(`${path}/${name}`); return; }
    if (!/\.(tsx?|css)$/.test(path)) return;
    const source = fs.readFileSync(path, "utf8");
    assert.doesNotMatch(source, /\.createRow\(|\.deleteRow\(/, path);
    if (!path.endsWith("lead-mutations.ts")) assert.doesNotMatch(source, /\.updateRow\(/, path);
    assert.doesNotMatch(source, /localStorage|sessionStorage/, path);
    assert.doesNotMatch(source, /lead_notes/, path);
  };
  for (const path of ["components/admin", "lib/admin", "app/admin"]) inspect(path);
});
