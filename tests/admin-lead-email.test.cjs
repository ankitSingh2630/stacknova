const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const { emailApi } = require("./helpers/admin.cjs");
const { createLeadEmailSender, validateLeadEmail, emailFailureMessage } = emailApi;
const confirmed = { status: "completed", responseStatusCode: 200, responseBody: '{"success":true}' };
const plain = value => JSON.parse(JSON.stringify(value));
function sender(execute, functionId = "private-email-function") {
  return createLeadEmailSender({ functions: { createExecution: execute }, config: { sendLeadEmailFunctionId: functionId } });
}

test("authenticated execution uses installed object signature and only leadId/subject/message", async () => {
  const calls = [];
  const send = sender(async input => { calls.push(plain(input)); return confirmed; });
  assert.equal((await send("lead-1", "  Follow up  ", "  First line\n\nSecond line  ")).ok, true);
  assert.deepEqual(calls, [{ functionId: "private-email-function", body: JSON.stringify({ leadId: "lead-1", subject: "Follow up", message: "First line\n\nSecond line" }),
    async: false, xpath: "/", method: "POST", headers: { "content-type": "application/json" } }]);
  assert.deepEqual(Object.keys(JSON.parse(calls[0].body)), ["leadId", "subject", "message"]);
});
for (const [label, id, subject, message] of [
  ["missing ID", "", "Subject", "Message"], ["invalid ID", "../lead", "Subject", "Message"], ["long ID", "a".repeat(37), "Subject", "Message"],
  ["required subject", "lead-1", "", "Message"], ["whitespace subject", "lead-1", "   ", "Message"],
  ["required message", "lead-1", "Subject", ""], ["whitespace message", "lead-1", "Subject", " \n\t "],
  ["long subject", "lead-1", "a".repeat(201), "Message"], ["long message", "lead-1", "Subject", "a".repeat(10001)],
  ["subject newline", "lead-1", "Subject\n", "Message"], ["subject tab", "lead-1", "Sub\tject", "Message"],
  ["subject control", "lead-1", "Sub\u0000ject", "Message"], ["message control", "lead-1", "Subject", "Message\u000B"],
  ["subject Unicode line separator", "lead-1", "Subject\u2028", "Message"], ["message C1 control", "lead-1", "Subject", "Message\u0085"],
  ["non-string subject", "lead-1", 12, "Message"], ["non-string message", "lead-1", "Subject", {}],
]) test(`frontend rejects ${label} without execution`, async () => {
  let calls = 0;
  const result = await sender(async () => { calls++; return confirmed; })(id, subject, message);
  assert.equal(result.ok, false); assert.equal(result.kind, "validation"); assert.equal(calls, 0);
});
test("maximum lengths, multiline messages, and HTML text are accepted", () => {
  assert.equal(validateLeadEmail("a".repeat(36), "a".repeat(200), "a".repeat(10000)).ok, true);
  assert.equal(validateLeadEmail("lead-1", "Subject", "<script>text</script>\r\nLine\ttext").ok, true);
});
test("missing Function configuration fails safely without execution", async () => {
  let calls = 0; const result = await sender(async () => { calls++; }, "")("lead-1", "Subject", "Message");
  assert.equal(result.message, emailFailureMessage); assert.equal(calls, 0);
});
for (const result of [
  { ...confirmed, status: "waiting" }, { ...confirmed, status: "processing" }, { ...confirmed, status: "failed" },
  { ...confirmed, responseStatusCode: 500 }, { ...confirmed, responseStatusCode: 401 }, { ...confirmed, responseStatusCode: 403 },
  { ...confirmed, responseBody: "{" }, { ...confirmed, responseBody: '{"success":false,"message":"secret raw provider error"}' },
  { ...confirmed, responseBody: '{"success":"true"}' }, { ...confirmed, responseBody: "null" }, { ...confirmed, responseBody: "[]" },
]) test(`unconfirmed execution never reports success: ${JSON.stringify(result)}`, async () => {
  const response = await sender(async () => result)("lead-1", "Subject", "Message");
  const expectedKind = result.status === "completed" && result.responseStatusCode === 401 ? "session" : result.status === "completed" && result.responseStatusCode === 403 ? "access" : "failure";
  assert.equal(response.ok, false); assert.equal(response.kind, expectedKind); assert.equal(response.message, emailFailureMessage);
});
for (const [code, kind] of [[401, "session"], [403, "access"], [500, "failure"], [undefined, "failure"]]) {
  test(`SDK ${code} maps to safe ${kind} without retry`, async () => {
    let calls = 0;
    const result = await sender(async () => { calls++; throw { code, message: "Resend secret raw error" }; })("lead-1", "Subject", "Message");
    assert.equal(result.kind, kind); assert.equal(result.message, emailFailureMessage); assert.equal(calls, 1);
  });
}
test("browser sources use the shared Functions instance and contain no Resend credentials/API", () => {
  const client = fs.readFileSync("lib/appwrite/client.ts", "utf8");
  assert.match(client, /export const functions = new Functions\(client\)/);
  for (const file of ["lib/admin/lead-email.ts", "components/admin/LeadEmailPanel.tsx", "components/admin/LeadDetails.tsx", "lib/appwrite/client.ts", "lib/appwrite/config.ts"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /RESEND_API_KEY|api\.resend\.com|from ["']resend["']|new Resend/, file);
    if (file !== "lib/appwrite/client.ts") assert.doesNotMatch(source, /new Client\(/, file);
  }
});

test("CC/BCC input becomes normalized optional arrays with case-insensitive deduplication and BCC precedence", async () => {
  let request;
  const send = sender(async input => { request = plain(input); return confirmed; });
  const result = await send("lead-1", " Subject ", " Message ",
    " Manager@Example.com , manager@example.com, hidden@example.com, visible@example.com ",
    " Hidden@Example.com, hidden@example.com, archive@example.com ");
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(request.body), { leadId: "lead-1", subject: "Subject", message: "Message",
    cc: ["Manager@Example.com", "visible@example.com"], bcc: ["Hidden@Example.com", "archive@example.com"] });
});
test("one/multiple CC and BCC accepted; blank lists and lists emptied by precedence omitted", () => {
  for (const field of ["cc", "bcc"]) {
    assert.deepEqual(plain(emailApi.parseEmailRecipients("one@example.com", field).addresses), ["one@example.com"]);
    assert.deepEqual(plain(emailApi.parseEmailRecipients("one@example.com, two@example.com", field).addresses), ["one@example.com", "two@example.com"]);
    assert.deepEqual(plain(emailApi.parseEmailRecipients("   ", field).addresses), []);
    assert.equal(emailApi.parseEmailRecipients(Array.from({length:10}, (_,i)=>`person${i}@example.com`).join(","), field).ok, true);
  }
  const result = validateLeadEmail("lead-1", "Subject", "Message", "same@example.com", "SAME@example.com");
  assert.equal(result.data.cc, undefined); assert.deepEqual(plain(result.data.bcc), ["SAME@example.com"]);
  assert.deepEqual(Object.keys(validateLeadEmail("lead-1", "Subject", "Message", " ", " ").data), ["leadId", "subject", "message"]);
});
for (const field of ["cc", "bcc"]) for (const value of [
  "invalid", "first@example.com,", ",first@example.com", "first@example.com,,second@example.com",
  "Name <person@example.com>", "person@example.com\n", "person@example.com\t", "person@example.com\u0085",
  "person@example.com\u2028", "a..b@example.com", `${"a".repeat(65)}@example.com`, `${"a".repeat(250)}@example.com`,
  Array(11).fill("same@example.com").join(","), null, [], 42,
]) test(`frontend blocks invalid ${field}: ${JSON.stringify(value).slice(0,80)}`, async () => {
  let calls = 0;
  const send = sender(async () => { calls++; return confirmed; });
  const result = await send("lead-1", "Subject", "Message", field === "cc" ? value : "", field === "bcc" ? value : "");
  assert.equal(result.ok, false); assert.equal(result.field, field); assert.equal(calls, 0);
  assert.match(result.message, new RegExp(`Enter valid ${field.toUpperCase()} email addresses`));
});
