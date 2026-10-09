const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(readFileSync(path.join(__dirname, "../lib/enquiry.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const failure = { success: false, message: "Unable to submit your enquiry right now. Please try again later." };
const success = { success: true, message: "Thank you! Your enquiry has been submitted successfully." };
const payload = {
  name: "Test Person", email: "test@example.com", phone: "+91 9876543210",
  company: "", service: "Web Development", message: "Please build a website.", source: "StackNova Website",
};
function client({ url = "https://enquiry-test.invalid", fetch = async () => { throw new Error("internal URL secret"); }, ...globals } = {}) {
  const sandbox = { exports: {}, URL, AbortController, setTimeout, clearTimeout, fetch,
    require: () => ({ appwriteConfig: { enquiryFunctionUrl: url } }), ...globals };
  vm.runInNewContext(source, sandbox, { filename: "lib/enquiry.ts" });
  return sandbox.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("client sends JSON only to the configured Function and accepts the success contract", async () => {
  let requests = 0;
  const api = client({ fetch: async (url, options) => {
    requests += 1;
    assert.equal(url, "https://enquiry-test.invalid/");
    assert.equal(options.method, "POST");
    assert.deepEqual(plain(options.headers), { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    return { status: 201, json: async () => success };
  } });
  assert.deepEqual(plain(await api.submitEnquiry(payload)), success);
  assert.equal(requests, 1);
});

test("missing or unsafe configuration fails safely without a request", async () => {
  for (const url of ["", "invalid", "http://enquiry-test.invalid", "https://user:secret@enquiry-test.invalid"]) {
    let requests = 0;
    const api = client({ url, fetch: async () => { requests += 1; } });
    assert.deepEqual(plain(await api.submitEnquiry(payload)), failure);
    assert.equal(requests, 0);
  }
});

test("setup exceptions, network errors, and serialization failures always resolve safely", async () => {
  const cases = [
    client(),
    client({ AbortController: class { constructor() { throw new Error("private setup detail"); } } }),
    client({ setTimeout: () => { throw new Error("private timer detail"); } }),
  ];
  for (const api of cases) assert.deepEqual(plain(await api.submitEnquiry(payload)), failure);
  const circular = { ...payload }; circular.self = circular;
  assert.deepEqual(plain(await client().submitEnquiry(circular)), failure);
});

test("malformed JSON, invalid shapes, unexpected messages, and non-2xx responses are normalized", async () => {
  const responses = [
    { status: 502, json: async () => { throw new Error("HTML gateway error"); } },
    { status: 201, json: async () => null },
    { status: 201, json: async () => ({ success: "true", message: success.message }) },
    { status: 201, json: async () => ({ success: true, message: "internal URL and stack trace" }) },
    { status: 200, json: async () => success },
    { status: 500, json: async () => ({ success: false, message: "secret database ID" }) },
    { status: 400, json: async () => ({ success: false, message: "secret fetch exception" }) },
  ];
  for (const response of responses) {
    assert.deepEqual(plain(await client({ fetch: async () => response }).submitEnquiry(payload)), failure);
  }
  const validation = { success: false, message: "Please enter a valid email address." };
  assert.deepEqual(plain(await client({ fetch: async () => ({ status: 400, json: async () => validation }) }).submitEnquiry(payload)), validation);
});

test("timeout feedback safely warns that receipt could not be confirmed", async () => {
  const api = client({ setTimeout: (callback) => { callback(); return 1; }, clearTimeout: () => {} });
  const result = await api.submitEnquiry(payload);
  assert.equal(result.success, false);
  assert.match(result.message, /may have been received/);
});

test("frontend and Function agree on trimming, formats, controls, services, and every length boundary", async () => {
  const api = client();
  const { createHandler } = await import("../functions/submit-enquiry/src/main.js");
  const cases = [payload,
    Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, "  " + value + "  "])),
    ...["name", "email", "phone", "service", "message"].map((field) => ({ ...payload, [field]: " \n\t " })),
    ...["bad-email", "a@@example.com", "a b@example.com"].map((email) => ({ ...payload, email })),
    ...["123", "1234567890123456", "CALL-NOW", "(123) 456-7890"].map((phone) => ({ ...payload, phone })),
    { ...payload, service: "unsupported" }, { ...payload, name: "a\nb" },
    { ...payload, company: "a\tb" }, { ...payload, message: "bad\u0000text" },
    { ...payload, message: "valid\nmultiline\tmessage" },
    ...api.enquiryServices.map((service) => ({ ...payload, service })),
  ];
  const boundaryValues = {
    name: "n".repeat(100), email: "e".repeat(242) + "@example.com",
    phone: "+" + " ".repeat(16) + "123456789012345", company: "c".repeat(150),
    message: "m".repeat(4000), source: "s".repeat(100),
  };
  for (const [field, value] of Object.entries(boundaryValues)) {
    cases.push({ ...payload, [field]: value }, { ...payload, [field]: value + "x" });
  }
  for (const body of cases) {
    let writes = 0;
    const handler = createHandler({ env: { DATABASE_ID: "test", LEADS_TABLE_ID: "test", ALLOWED_ORIGINS: "http://localhost:3000",
      APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite-test.invalid/v1", APPWRITE_FUNCTION_PROJECT_ID: "test-project" },
      writeLead: async () => { writes += 1; } });
    const result = await handler({ req: { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json",
      "x-appwrite-key": "fake-execution-key" }, bodyText: JSON.stringify(body) },
      res: { json: (body, status) => ({ body, status }) } });
    const valid = Object.keys(api.validateEnquiry(body)).length === 0;
    assert.equal(valid, result.status === 201, JSON.stringify(body).slice(0, 160));
    assert.equal(writes, valid ? 1 : 0);
  }
});
