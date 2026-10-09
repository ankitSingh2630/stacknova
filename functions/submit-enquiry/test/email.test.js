import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createHandler } from "../src/main.js";
import { buildCustomerConfirmationEmail, buildAdminLeadEmail } from "../src/email-templates.js";

// All credentials and addresses are artificial fixtures; no live API is used.
const env = {
  DATABASE_ID: "test-database", LEADS_TABLE_ID: "test-leads",
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite-test.invalid/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "test-project", ALLOWED_ORIGINS: "http://localhost:3000",
  RESEND_API_KEY: "dummy-email-credential", RESEND_FROM_EMAIL: "sender@example.com",
  STACKNOVA_LEADS_EMAIL: "leads@example.com",
};
const payload = {
  name: " Rahul Sharma ", email: " rahul@example.com ", phone: " +91 9876543210 ",
  company: " Example Company ", service: " Web Development ",
  message: " First line\nSecond line ", source: " untrusted source ",
};
const success = { success: true, message: "Thank you! Your enquiry has been submitted successfully." };

async function invoke({ config = env, body = payload, dbError, emailErrors = {}, returnedErrors = {},
  clientError, useSDK = false, beforeSave = async () => {}, send } = {}) {
  const writes = [], emails = [], events = [], errors = [], logs = [];
  let saved = false;
  let initialized = 0;
  const writeLead = async ({ data }) => {
    events.push("write-started");
    writes.push(structuredClone(data));
    await beforeSave();
    if (dbError) throw dbError;
    saved = true;
    events.push("write-completed");
  };
  const createEmailClient = (key) => {
    assert.equal(saved, true, "client must not initialize before database success");
    assert.equal(key, config.RESEND_API_KEY);
    events.push("client-initialized");
    initialized += 1;
    if (clientError) throw clientError;
    return { emails: { send: async (email, options) => {
      assert.equal(saved, true, "email must not start before database success");
      assert.ok(options.signal instanceof AbortSignal);
      const operation = email.to === body.email.trim() ? "customer" : "admin";
      emails.push(email);
      events.push(operation);
      if (send) return send(operation, email, options);
      if (emailErrors[operation]) throw emailErrors[operation];
      if (returnedErrors[operation]) return { data: null, error: returnedErrors[operation] };
      return { data: { id: `fake-${operation}-email` }, error: null };
    } } };
  };
  const handler = createHandler({ env: config, writeLead, ...(useSDK ? {} : { createEmailClient }) });
  const response = await handler({
    req: { method: "POST", bodyText: JSON.stringify(body), headers: {
      origin: "http://localhost:3000", "content-type": "application/json",
      "x-appwrite-key": "fake-execution-key",
    } },
    res: { json: (body, status, headers) => { events.push("response"); return { body, status, headers }; } },
    log: (message) => logs.push(message), error: (message) => errors.push(message),
  });
  return { ...response, writes, emails, events, errors, logs, initialized, saved };
}

function assertSavedSuccess(result) {
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, success);
  assert.equal(result.saved, true);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0].status, "New");
  assert.equal(result.writes[0].source, "StackNova Website");
  assert.equal(Object.hasOwn(result.writes[0], "notes"), false);
  assert.equal(result.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.equal(result.headers.Vary, "Origin");
}

test("saved lead sends both emails with correct addresses, sender, Reply-To, content, and safe response", async () => {
  const result = await invoke();
  assertSavedSuccess(result);
  assert.equal(result.initialized, 1);
  assert.equal(result.emails.length, 2);
  const [customer, admin] = result.emails;
  assert.equal(customer.to, "rahul@example.com");
  assert.equal(admin.to, env.STACKNOVA_LEADS_EMAIL);
  assert.equal(admin.replyTo, "rahul@example.com");
  for (const email of result.emails) {
    assert.equal(email.from, env.RESEND_FROM_EMAIL);
    assert.notEqual(email.from, customer.to);
    assert.match(email.html, /<!doctype html>/);
    assert.match(email.html, /#070B14/);
    assert.match(email.html, /#06B6D4/);
  }
  assert.equal(customer.subject, "We received your enquiry — StackNova Technologies");
  assert.equal(admin.subject, "New Website Enquiry — Web Development — Rahul Sharma");
  for (const content of [customer.html, customer.text]) {
    assert.match(content, /Rahul Sharma/);
    assert.match(content, /Web Development/);
    assert.match(content, /received your enquiry/);
    assert.match(content, /review your requirements/);
    assert.match(content, /get back to you/);
  }
  for (const content of [admin.html, admin.text]) {
    for (const value of ["Name", "Email", "Phone", "Company", "Service", "Message", "Source", "Status",
      "Rahul Sharma", "rahul@example.com", "+91 9876543210", "Example Company", "Web Development",
      "First line", "Second line", "StackNova Website", "New"]) assert.ok(content.includes(value), value);
    assert.ok(!content.includes("untrusted source"));
  }
  assert.equal(result.errors.length, 0);
  assert.equal(result.logs.length, 2);
});

test("database failure attempts no emails and never initializes Resend", async () => {
  const result = await invoke({ dbError: new Error("private database failure") });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { success: false, message: "Unable to submit your enquiry right now." });
  assert.equal(result.saved, false);
  assert.equal(result.initialized, 0);
  assert.deepEqual(result.emails, []);
  assert.deepEqual(result.events, ["write-started", "response"]);
  assert.equal(result.errors.length, 1);
});

test("database promise must resolve before client initialization and either email attempt", async () => {
  let finishSave;
  let markWriteStarted;
  const writeStarted = new Promise((resolve) => { markWriteStarted = resolve; });
  const saving = new Promise((resolve) => { finishSave = resolve; });
  const pending = invoke({ beforeSave: () => { markWriteStarted(); return saving; } });
  await writeStarted;
  // The factory and send stubs also assert that storage has completed.
  finishSave();
  const result = await pending;
  assert.deepEqual(result.events, ["write-started", "write-completed", "client-initialized", "customer", "admin", "response"]);
  assertSavedSuccess(result);
});

for (const [label, operations] of [
  ["customer", ["customer"]], ["admin", ["admin"]], ["both", ["customer", "admin"]],
]) {
  for (const mode of ["thrown", "returned"]) {
    test(`${label} email ${mode} failure retains saved lead, attempts both emails, and returns success`, async () => {
      const failures = Object.fromEntries(operations.map((operation) => [operation,
        Object.assign(new Error(`${operation} provider failure`), { name: "TestProviderError", statusCode: 422 })]));
      const result = await invoke(mode === "thrown" ? { emailErrors: failures } : { returnedErrors: failures });
      assertSavedSuccess(result);
      assert.equal(result.emails.length, 2);
      assert.equal(result.errors.length, operations.length);
      assert.equal(result.logs.length, 2 - operations.length);
      if (operations.includes("customer")) assert.match(result.errors[0], /Customer confirmation/);
      if (operations.includes("admin")) assert.match(result.errors.at(-1), /Admin notification/);
      for (const operation of operations) assert.ok(!JSON.stringify(result.body).includes(`${operation} provider failure`));
    });
  }
}

test("admin starts even while the customer email is pending, and both settle before success", async () => {
  let rejectCustomer;
  let markAdminStarted;
  const customer = new Promise((_, reject) => { rejectCustomer = reject; });
  const adminStarted = new Promise((resolve) => { markAdminStarted = resolve; });
  const pending = invoke({ send: async (operation) => {
    if (operation === "customer") return customer;
    markAdminStarted();
    return { data: { id: "fake-admin-email" }, error: null };
  } });
  await adminStarted;
  rejectCustomer(new Error("customer failed after admin started"));
  const result = await pending;
  assertSavedSuccess(result);
  assert.equal(result.emails.length, 2);
});

for (const key of ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "STACKNOVA_LEADS_EMAIL"]) {
  test(`missing ${key} skips only affected operations, logs key name, and keeps HTTP 201`, async () => {
    for (const value of [undefined, "", "   "]) {
      const result = await invoke({ config: { ...env, [key]: value } });
      assertSavedSuccess(result);
      const adminOnly = key === "STACKNOVA_LEADS_EMAIL";
      assert.equal(result.emails.length, adminOnly ? 1 : 0);
      assert.equal(result.initialized, adminOnly ? 1 : 0);
      assert.equal(result.errors.length, adminOnly ? 1 : 2);
      for (const entry of result.errors) {
        assert.ok(entry.includes(`Missing configuration: ${key}`));
        for (const configured of Object.values(env)) assert.ok(!entry.includes(configured));
      }
      if (adminOnly) assert.equal(result.emails[0].to, "rahul@example.com");
    }
  });
}

test("all missing email configuration logs names for each operation after saving without initializing", async () => {
  const result = await invoke({ config: { ...env, RESEND_API_KEY: "", RESEND_FROM_EMAIL: "", STACKNOVA_LEADS_EMAIL: "" } });
  assertSavedSuccess(result);
  assert.equal(result.initialized, 0);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /RESEND_API_KEY, RESEND_FROM_EMAIL/);
  assert.match(result.errors[1], /RESEND_API_KEY, RESEND_FROM_EMAIL, STACKNOVA_LEADS_EMAIL/);
});

test("client initialization failures are isolated per operation and do not affect saved lead", async () => {
  const result = await invoke({ clientError: new Error("client constructor failed") });
  assertSavedSuccess(result);
  assert.equal(result.initialized, 2);
  assert.equal(result.errors.length, 2);
  assert.equal(result.emails.length, 0);
});

test("unexpected provider success shape is treated as email failure, preserving enquiry success", async () => {
  const result = await invoke({ send: async () => ({ data: null, error: null }) });
  assertSavedSuccess(result);
  assert.equal(result.errors.length, 2);
});

test("Resend and runtime credentials are redacted from whitelisted logs; raw responses and stacks are excluded", async () => {
  const failure = {
    name: `Provider-${env.RESEND_API_KEY}`, message: `Failure ${env.RESEND_API_KEY} fake-execution-key`,
    code: env.RESEND_API_KEY, statusCode: 401,
    response: { secret: "raw-response-marker", credential: env.RESEND_API_KEY },
    stack: "private-stack-marker", headers: { authorization: env.RESEND_API_KEY },
  };
  const result = await invoke({ returnedErrors: { customer: failure, admin: failure } });
  assertSavedSuccess(result);
  const observable = JSON.stringify({ body: result.body, logs: result.logs, errors: result.errors });
  for (const forbidden of [env.RESEND_API_KEY, "fake-execution-key", "raw-response-marker", "private-stack-marker"])
    assert.ok(!observable.includes(forbidden));
  assert.match(observable, /REDACTED/);
  assert.match(observable, /statusCode/);
});

test("Resend credential is also redacted from database failure logs", async () => {
  const result = await invoke({ dbError: new Error(`Database error ${env.RESEND_API_KEY}`) });
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify({ body: result.body, errors: result.errors }).includes(env.RESEND_API_KEY));
});

test("customer template cannot include private data even when its input contains metadata and notes", () => {
  const email = buildCustomerConfirmationEmail({ ...payload,
    notes: "private-notes-marker", $id: "private-row-marker", $createdAt: "private-time-marker",
    status: "private-status-marker", deletedAt: "private-deletion-marker", secret: env.RESEND_API_KEY,
  });
  const content = JSON.stringify(email);
  for (const forbidden of ["private-notes-marker", "private-row-marker", "private-time-marker",
    "private-status-marker", "private-deletion-marker", env.RESEND_API_KEY, payload.message.trim(), "Status:"])
    assert.ok(!content.includes(forbidden), forbidden);
});

test("both templates escape every user-controlled HTML field and preserve multiline messages safely", () => {
  const unsafe = `<img src=x onerror="alert('x')"> &`;
  const escaped = "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp;";
  for (const field of ["name", "email", "phone", "company", "service", "message", "source"]) {
    const data = { ...payload, [field]: unsafe };
    const admin = buildAdminLeadEmail(data);
    assert.ok(admin.html.includes(escaped), field);
    assert.ok(!admin.html.includes(unsafe), field);
    if (["name", "service"].includes(field)) {
      const customer = buildCustomerConfirmationEmail(data);
      assert.ok(customer.html.includes(escaped), field);
      assert.ok(!customer.html.includes(unsafe), field);
    }
  }
  assert.match(buildAdminLeadEmail({ ...payload, message: "a\r\nb\nc\rd" }).html, /a<br>b<br>c<br>d/);
  for (const email of [buildCustomerConfirmationEmail(payload), buildAdminLeadEmail(payload)])
    assert.doesNotMatch(email.html, /<script|<iframe|<img|@import|<link|animation:|display:grid|display:flex/i);
  assert.match(buildAdminLeadEmail({ ...payload, company: "" }).text, /Company: Not provided/);
});

test("submitted internal fields including notes are rejected without email initialization", async () => {
  for (const field of ["status", "notes", "deletedAt", "$id", "$createdAt", "$updatedAt"]) {
    const result = await invoke({ body: { ...payload, [field]: "private" } });
    assert.equal(result.status, 400);
    assert.equal(result.writes.length, 0);
    assert.equal(result.initialized, 0);
    assert.equal(result.emails.length, 0);
  }
});

test("official Resend SDK is intercepted: correct wire addresses, post-save order, timeout signal, and safe provider failure", async () => {
  const requests = [];
  const consoleError = mock.method(console, "error", () => {});
  const fetchMock = mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(new Headers(options.headers).get("authorization"), `Bearer ${env.RESEND_API_KEY}`);
    const email = JSON.parse(options.body);
    requests.push(email);
    if (email.to === "rahul@example.com") return new Response(JSON.stringify({
      name: "validation_error", message: `Rejected ${env.RESEND_API_KEY}`, statusCode: 422,
      response: "raw-response-marker",
    }), { status: 422, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ id: "fake-admin-email" }), { status: 200 });
  });
  try {
    const result = await invoke({ useSDK: true });
    assertSavedSuccess(result);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].to, "rahul@example.com");
    assert.equal(requests[1].to, env.STACKNOVA_LEADS_EMAIL);
    assert.equal(requests[1].reply_to, "rahul@example.com");
    assert.equal(requests[1].from, env.RESEND_FROM_EMAIL);
    assert.equal(result.errors.length, 1);
    assert.equal(result.logs.length, 1);
    assert.ok(!JSON.stringify(result.errors).includes(env.RESEND_API_KEY));
    assert.ok(!JSON.stringify(result.errors).includes("raw-response-marker"));
    assert.equal(consoleError.mock.callCount(), 0, "SDK must not automatically log raw provider errors");
  } finally { fetchMock.mock.restore(); consoleError.mock.restore(); }
});
