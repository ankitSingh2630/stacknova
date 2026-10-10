import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { createHandler } from "../src/main.js";

const env = { DATABASE_ID: "test-db", LEADS_TABLE_ID: "test-leads", RESEND_API_KEY: "fake-secret-key",
  RESEND_FROM_EMAIL: "sales@stacknova.in", APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite-test.invalid/v1", APPWRITE_FUNCTION_PROJECT_ID: "test-project" };
const payload = { leadId: "lead-1", subject: "  Project quotation follow-up  ", message: "  Hi, reviewed your project.\n\nNext steps.  " };
const lead = { $id: "lead-1", name: "Ankit", email: "stored@example.com", service: "Web Development", deletedAt: null };
async function invoke({ body = payload, bodyText, row = lead, loadError, emailResult = { data: { id: "accepted-email" }, error: null }, sendError,
  config = env, headers = {}, method = "POST", useDatabaseSDK = false, useEmailSDK = false, loggerThrows = false } = {}) {
  const reads = [], emails = [], logs = [], errors = [], order = [];
  const handler = createHandler({ env: config,
    ...(useDatabaseSDK ? {} : { loadLead: async input => { reads.push(input); order.push("read"); if (loadError) throw loadError; return row; } }),
    ...(useEmailSDK ? {} : { createEmailClient: key => { assert.equal(key, env.RESEND_API_KEY); order.push("email-client"); return { emails: {
      send: async (email, options) => { emails.push(email); order.push("send"); assert.ok(options.signal instanceof AbortSignal); if (sendError) throw sendError; return emailResult; },
    } }; } }),
  });
  const result = await handler({ req: { method, bodyText: bodyText ?? JSON.stringify(body), headers: {
    "content-type": "application/json", "x-appwrite-key": "fake-runtime-key", "x-appwrite-user-id": "authenticated-admin", ...headers,
  } }, res: { json: (body, status, headers) => ({ body, status, headers }) },
  log: message => { logs.push(message); if (loggerThrows) throw Error("log unavailable"); },
  error: message => { errors.push(message); if (loggerThrows) throw Error("log unavailable"); } });
  return { ...result, reads, emails, logs, errors, order };
}

test("loads lead by requested ID then sends to stored email with correct From and custom subject", async () => {
  const result = await invoke();
  assert.equal(result.status, 200); assert.deepEqual(result.body, { success: true, message: "Email sent successfully." });
  assert.deepEqual(result.order, ["read", "email-client", "send"]); assert.equal(result.reads[0].leadId, payload.leadId);
  assert.equal(result.emails.length, 1); const email = result.emails[0];
  assert.deepEqual(email.to, [lead.email]); assert.equal(email.from, "StackNova Technologies <sales@stacknova.in>");
  assert.equal(email.subject, "Project quotation follow-up"); assert.equal(email.replyTo, undefined);
  assert.ok(email.html.includes("Hi, reviewed your project.<br><br>Next steps."));
  assert.ok(email.text.includes("Hi, reviewed your project.\n\nNext steps."));
  assert.equal(result.headers["Cache-Control"], "no-store");
});
for (const body of [null, [], 42, "text", {}, { ...payload, to: "attacker@example.com" }, { ...payload, recipientEmail: "attacker@example.com" },
  { ...payload, leadId: "../private" }, { ...payload, leadId: "a".repeat(37) }, { ...payload, leadId: "" },
  { ...payload, subject: "" }, { ...payload, subject: "   " }, { ...payload, subject: 42 }, { ...payload, subject: "a".repeat(201) },
  { ...payload, subject: "Subject\n" }, { ...payload, subject: "Sub\tject" }, { ...payload, subject: "Sub\u0000ject" },
  { ...payload, message: "" }, { ...payload, message: " \n\t " }, { ...payload, message: {} }, { ...payload, message: "a".repeat(10001) },
  { ...payload, message: "Message\u000B" }, { ...payload, message: "Bad\u007F" },
  { ...payload, subject: "Subject\u2028" }, { ...payload, message: "Message\u0085" },
]) test(`invalid input rejects before read/send: ${JSON.stringify(body).slice(0, 100)}`, async () => {
  const result = await invoke({ body }); assert.equal(result.status, 400); assert.equal(result.reads.length, 0); assert.equal(result.emails.length, 0);
});
test("malformed JSON and oversized body rejected before database access", async () => {
  for (const bodyText of ["{", "", "not JSON"]) {
    const result = await invoke({ bodyText }); assert.equal(result.status, 400); assert.equal(result.reads.length, 0);
  }
  const result = await invoke({ bodyText: " ".repeat(65537) }); assert.equal(result.status, 413); assert.equal(result.reads.length, 0);
});
test("max lengths and multiline message accepted", async () => {
  const result = await invoke({ body: { ...payload, subject: "a".repeat(200), message: "a".repeat(9997) + "\n\tb" } });
  assert.equal(result.status, 200);
});
for (const [method, headers, status] of [["GET", {}, 405], ["OPTIONS", {}, 405], ["POST", { "content-type": "text/plain" }, 415],
  ["POST", { "x-appwrite-user-id": "" }, 401], ["POST", { "x-appwrite-user-id": undefined }, 401]]) {
  test(`unsupported or unauthenticated request safely fails ${status}`, async () => {
    const result = await invoke({ method, headers }); assert.equal(result.status, status); assert.equal(result.reads.length, 0); assert.equal(result.emails.length, 0);
  });
}
test("unknown lead returns safe 404 and cannot send", async () => {
  const result = await invoke({ loadError: { code: 404, message: "raw database internals" } });
  assert.equal(result.status, 404); assert.equal(result.emails.length, 0); assert.doesNotMatch(JSON.stringify(result.body), /internals/);
});
for (const deletedAt of ["2026-10-10T00:00:00.000Z", "malformed", "   ", 123]) test(`archived/populated deletion marker rejected: ${deletedAt}`, async () => {
  const result = await invoke({ row: { ...lead, deletedAt } }); assert.equal(result.status, 404); assert.equal(result.emails.length, 0);
});
test("mismatched returned row fails closed", async () => {
  const result = await invoke({ row: { ...lead, $id: "other-lead" } }); assert.equal(result.status, 500); assert.equal(result.emails.length, 0);
});
for (const email of [undefined, "", "invalid", "a@b", "a@example.com,other@example.com", "A <a@example.com>", "a@example.com\n", "a@example.com ", "a@-bad.com", ".a@example.com", "a..b@example.com"]) {
  test(`invalid stored email rejected: ${email}`, async () => {
    const result = await invoke({ row: { ...lead, email } }); assert.equal(result.status, 422); assert.equal(result.emails.length, 0);
  });
}
for (const key of Object.keys(env)) test(`missing ${key} returns safe failure without read or send`, async () => {
  const result = await invoke({ config: { ...env, [key]: "" } }); assert.equal(result.status, 500); assert.equal(result.reads.length, 0); assert.equal(result.emails.length, 0);
});
test("invalid sender and missing runtime key fail safely", async () => {
  assert.equal((await invoke({ config: { ...env, RESEND_FROM_EMAIL: "Sales <sales@stacknova.in>" } })).status, 500);
  assert.equal((await invoke({ headers: { "x-appwrite-key": "" } })).status, 500);
});
for (const options of [{ sendError: Error("raw Resend fake-secret-key") }, { emailResult: { data: null, error: { message: "raw Resend fake-secret-key" } } },
  { emailResult: { data: {}, error: null } }, { emailResult: null }]) test("provider error or missing acceptance ID never returns success", async () => {
  const result = await invoke(options); assert.equal(result.status, 500); assert.equal(result.body.success, false);
  assert.equal(result.body.message, "Unable to send email right now.");
  assert.doesNotMatch(JSON.stringify([result.body, result.logs, result.errors]), /raw Resend|fake-secret-key/);
});
test("database 401/403/500 become safe Function failures, without email attempt", async () => {
  for (const code of [401, 403, 500]) {
    const result = await invoke({ loadError: { code, message: "private database details" } });
    assert.equal(result.status, 500); assert.equal(result.emails.length, 0); assert.doesNotMatch(JSON.stringify(result.body), /private database/);
  }
});
test("logging failures do not change confirmed send", async () => { assert.equal((await invoke({ loggerThrows: true })).status, 200); });

test("actual installed TablesDB SDK issues only GET to the configured lead with runtime credentials", async () => {
  const original = getGlobalDispatcher(), agent = new MockAgent(); agent.disableNetConnect(); setGlobalDispatcher(agent);
  let observed;
  agent.get("https://appwrite-test.invalid").intercept({ path: "/v1/tablesdb/test-db/tables/test-leads/rows/lead-1", method: "GET" })
    .reply(200, request => { observed = request; return lead; }, { headers: { "content-type": "application/json" } });
  try {
    const result = await invoke({ useDatabaseSDK: true }); assert.equal(result.status, 200); assert.deepEqual(result.emails[0].to, [lead.email]);
    const headers = new Headers(observed.headers); assert.equal(headers.get("x-appwrite-key"), "fake-runtime-key");
    assert.equal(headers.get("x-appwrite-project"), "test-project"); agent.assertNoPendingInterceptors();
  } finally { setGlobalDispatcher(original); await agent.close(); }
});
test("real Resend SDK wire payload includes plaintext, inline CID bytes, sender and no customer Reply-To", async () => {
  const requests = [];
  const intercepted = mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails"); requests.push(JSON.parse(options.body));
    return new Response('{"id":"accepted-by-mocked-provider"}', { status: 200 });
  });
  try {
    const result = await invoke({ useEmailSDK: true }); assert.equal(result.status, 200); assert.equal(requests.length, 1);
    const email = requests[0]; assert.equal(email.from, "StackNova Technologies <sales@stacknova.in>"); assert.deepEqual(email.to, [lead.email]);
    assert.equal(email.subject, payload.subject.trim()); assert.equal(email.reply_to, undefined); assert.ok(email.text.includes("Service: Web Development"));
    assert.equal(email.attachments[0].content_id, "stacknova-logo");
    assert.deepEqual(Buffer.from(email.attachments[0].content, "base64"), readFileSync(new URL("../assets/stacknova-logo.png", import.meta.url)));
  } finally { intercepted.mock.restore(); }
});
test("runtime sources have zero database mutations and no cross-Function/design imports", () => {
  for (const filename of readdirSync(new URL("../src/", import.meta.url))) {
    const source = readFileSync(new URL(`../src/${filename}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\.(?:updateRow|createRow|deleteRow|upsertRow)\(|from ["'][^"']*submit-enquiry|docs\/email-template|screen\.png|lead_emails/);
  }
});

test("server independently trims/deduplicates copies, lets BCC win and removes authoritative primary To", async () => {
  const result = await invoke({body:{...payload,
    cc:[" Manager@Example.com ","manager@example.com","shared@example.com"," STORED@example.com "],
    bcc:[" Shared@Example.com ","shared@example.com","stored@example.com"," Archive@Example.com "] }});
  assert.equal(result.status, 200);
  const email = result.emails[0]; assert.deepEqual(email.to, [lead.email]);
  assert.deepEqual(email.cc, ["Manager@Example.com"]); assert.deepEqual(email.bcc, ["Shared@Example.com", "Archive@Example.com"]);
  const visible = JSON.stringify([email.html,email.text,result.logs,result.errors,result.body]);
  for (const address of [...email.cc,...email.bcc]) assert.ok(!visible.toLowerCase().includes(address.toLowerCase()));
});
test("primary-only and empty normalized copies are omitted completely from Resend", async () => {
  for (const extra of [{}, {cc:[],bcc:[]}, {cc:["STORED@example.com"]}, {bcc:["stored@example.com"]}, {cc:["stored@example.com"],bcc:["STORED@example.com"]}]) {
    const result = await invoke({body:{...payload,...extra}}); assert.equal(result.status, 200);
    assert.equal(Object.hasOwn(result.emails[0],"cc"),false); assert.equal(Object.hasOwn(result.emails[0],"bcc"),false);
  }
});
test("ten supplied entries per field accepted; count enforced before deduplication", async () => {
  const cc = Array.from({length:10}, (_,i)=>`cc${i}@example.com`), bcc=Array.from({length:10}, (_,i)=>`bcc${i}@example.com`);
  const result = await invoke({body:{...payload,cc,bcc}}); assert.equal(result.status, 200);
  assert.deepEqual(result.emails[0].cc,cc); assert.deepEqual(result.emails[0].bcc,bcc);
});
for (const field of ["cc","bcc"]) for (const value of [
  null, "person@example.com", 42, {}, [null], [42], [{}], [""], ["   "], ["bad"], ["Name <person@example.com>"],
  ["one@example.com,two@example.com"], ["one@example.com\n"], ["one@example.com\t"], ["one@example.com\u0000"],
  ["one@example.com\u0085"], ["one@example.com\u2028"], [`${"a".repeat(65)}@example.com`], Array(11).fill("same@example.com"),
]) test(`Function rejects malformed ${field}: ${JSON.stringify(value).slice(0,80)}`, async () => {
  const result=await invoke({body:{...payload,[field]:value}});
  assert.equal(result.status,400); assert.equal(result.reads.length,0); assert.equal(result.emails.length,0);
});
test("real Resend SDK receives cc/bcc headers only, without recipient leaks to content or logs", async () => {
  const requests=[];
  const intercepted=mock.method(globalThis,"fetch",async(url,options)=>{ assert.equal(url,"https://api.resend.com/emails"); requests.push(JSON.parse(options.body)); return new Response('{"id":"mocked-acceptance"}',{status:200}); });
  try {
    const result=await invoke({useEmailSDK:true,body:{...payload,cc:["visible@example.com"],bcc:["secret-copy@example.com"]}});
    assert.equal(result.status,200); assert.deepEqual(requests[0].cc,["visible@example.com"]); assert.deepEqual(requests[0].bcc,["secret-copy@example.com"]);
    assert.deepEqual(requests[0].to,[lead.email]); assert.equal(requests[0].reply_to,undefined);
    assert.doesNotMatch(JSON.stringify([requests[0].html,requests[0].text,result.logs,result.errors]),/visible@example.com|secret-copy@example.com/);
    requests.length=0; const empty=await invoke({useEmailSDK:true,body:{...payload,cc:[],bcc:[]}}); assert.equal(empty.status,200);
    assert.equal(Object.hasOwn(requests[0],"cc"),false); assert.equal(Object.hasOwn(requests[0],"bcc"),false);
  } finally { intercepted.mock.restore(); }
});
test("copy addresses are not exposed when provider errors contain them", async () => {
  const result=await invoke({body:{...payload,cc:["visible@example.com"],bcc:["secret-copy@example.com"]},sendError:Error("visible@example.com secret-copy@example.com")});
  assert.equal(result.status,500); assert.doesNotMatch(JSON.stringify([result.body,result.logs,result.errors]),/visible@example.com|secret-copy@example.com/);
});
