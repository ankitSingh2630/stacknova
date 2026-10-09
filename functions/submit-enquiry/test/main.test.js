import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../src/main.js";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";

const env = {
  DATABASE_ID: "test-database", LEADS_TABLE_ID: "test-leads",
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite-test.invalid/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "test-project",
  ALLOWED_ORIGINS: "http://localhost:3000",
};
const payload = {
  name: "  Rahul Sharma  ", email: "  rahul@example.com  ", phone: " +91 9876543210 ",
  company: " ABC Technologies ", service: " Web Development ",
  message: " I need a website for my business. ", source: " untrusted source ",
};

async function invoke({ body = payload, bodyText, method = "POST", headers = {}, config = env, fail = false, useSDK = false } = {}) {
  const writes = [];
  const logs = [];
  const writeLead = async (input) => {
    writes.push(input);
    if (fail) throw fail === true ? new Error("internal-database-error") : fail;
  };
  const handler = createHandler({ env: config, ...(useSDK ? {} : { writeLead }) });
  const response = await handler({
    req: { method, bodyText: bodyText ?? JSON.stringify(body), headers: {
      origin: "http://localhost:3000", "content-type": "application/json",
      "x-appwrite-key": "fake-execution-key", ...headers,
    } },
    res: {
      json: (body, status, headers) => ({ body, status, headers }),
      text: (body, status, headers) => ({ body, status, headers }),
    },
    error: (message) => logs.push(message),
  });
  return { ...response, writes, logs };
}

test("valid enquiry is trimmed, server-owned fields are assigned, and exactly one write occurs", async () => {
  const result = await invoke();
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { success: true, message: "Thank you! Your enquiry has been submitted successfully." });
  assert.equal(result.writes.length, 1);
  assert.deepEqual(result.writes[0].data, {
    name: "Rahul Sharma", email: "rahul@example.com", phone: "+91 9876543210",
    company: "ABC Technologies", service: "Web Development",
    message: "I need a website for my business.", source: "StackNova Website", status: "New",
  });
  assert.equal(Object.hasOwn(result.writes[0].data, "deletedAt"), false);
  assert.equal(Object.hasOwn(result.writes[0].data, "notes"), false);
  assert.equal(result.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.equal(result.headers.Vary, "Origin");
});

test("optional company and source can be omitted", async () => {
  const { company, source, ...body } = payload;
  const result = await invoke({ body });
  assert.equal(result.status, 201);
  assert.equal(result.writes[0].data.company, "");
  assert.equal(result.writes[0].data.source, "StackNova Website");
});

test("malformed and non-object JSON never writes", async () => {
  for (const bodyText of ["{", "", "null", "[]", "42", '"hello"']) {
    const result = await invoke({ bodyText });
    assert.equal(result.status, 400);
    assert.equal(result.writes.length, 0);
  }
});

test("missing, blank, invalid, long, or non-string fields never writes", async () => {
  const invalid = [
    { name: "   " }, { email: "not-an-email" }, { phone: "123" },
    { phone: "+91 CALL-NOW" }, { phone: "1234567890123456" }, { service: "" },
    { service: "unsupported" }, { message: "\n\t " }, { name: 123 }, { company: null },
    { source: {} }, { name: "n".repeat(101) }, { email: "e".repeat(255) },
    { phone: "1".repeat(33) }, { company: "c".repeat(151) },
    { service: "s".repeat(101) }, { message: "m".repeat(4001) },
    { source: "s".repeat(101) }, { message: "bad\u0000text" }, { name: "a\nb" },
  ];
  for (const change of invalid) {
    const result = await invoke({ body: { ...payload, ...change } });
    assert.equal(result.status, 400, JSON.stringify(change).slice(0, 120));
    assert.equal(result.writes.length, 0);
    assert.equal(result.body.success, false);
  }
  for (const field of ["name", "email", "phone", "service", "message"]) {
    const body = { ...payload };
    delete body[field];
    assert.equal((await invoke({ body })).writes.length, 0);
  }
});

test("privileged and unexpected fields never writes", async () => {
  for (const field of ["status", "notes", "deletedAt", "createdAt", "updatedAt", "$id", "$createdAt", "$updatedAt", "$permissions", "databaseId", "tableId", "__proto__", "extra"]) {
    const result = await invoke({ body: { ...payload, [field]: "Converted" } });
    assert.equal(result.status, 400);
    assert.equal(result.writes.length, 0);
  }
});

test("localhost is allowed; other origins and absent Origin fail closed", async () => {
  for (const origin of env.ALLOWED_ORIGINS.split(",")) {
    const result = await invoke({ headers: { origin } });
    assert.equal(result.status, 201);
    assert.equal(result.headers["Access-Control-Allow-Origin"], origin);
  }
  for (const origin of [undefined, "null", "https://stacknova.in", "https://www.stacknova.in", "https://evil.example", "https://stacknova.in.evil.example", "http://stacknova.in", "http://localhost:3001"]) {
    const result = await invoke({ headers: { origin } });
    assert.equal(result.status, 403);
    assert.equal(result.writes.length, 0);
    assert.equal(result.headers["Access-Control-Allow-Origin"], undefined);
  }
});

test("JSON preflight permits POST without creating a lead", async () => {
  const headers = { "access-control-request-method": "POST", "access-control-request-headers": "Content-Type", "x-appwrite-key": undefined };
  const result = await invoke({ method: "OPTIONS", headers });
  assert.equal(result.status, 204);
  assert.equal(result.body, "");
  assert.equal(result.headers["Access-Control-Allow-Methods"], "POST");
  assert.equal(result.headers["Access-Control-Allow-Headers"], "Content-Type");
  assert.equal(result.headers["Access-Control-Allow-Credentials"], undefined);
  assert.equal(result.writes.length, 0);
  for (const change of [{ "access-control-request-method": "GET" }, { "access-control-request-headers": "Authorization" }]) {
    const rejected = await invoke({ method: "OPTIONS", headers: { ...headers, ...change } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.writes.length, 0);
  }
});

test("unsupported methods, content types, and oversized bodies never write", async () => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD"]) {
    const result = await invoke({ method });
    assert.equal(result.status, 405);
    assert.equal(result.writes.length, 0);
  }
  const wrongType = await invoke({ headers: { "content-type": "text/plain" } });
  assert.equal(wrongType.status, 415);
  assert.equal(wrongType.writes.length, 0);
  const huge = await invoke({ body: { ...payload, message: "字".repeat(11000) } });
  assert.equal(huge.status, 413);
  assert.equal(huge.writes.length, 0);
  assert.equal((await invoke({ headers: { "content-type": "application/json; charset=utf-8" } })).status, 201);
});

test("configuration failures are safe and never write", async () => {
  for (const change of [{ ALLOWED_ORIGINS: "" }, { ALLOWED_ORIGINS: "*" }, { ALLOWED_ORIGINS: "https://stacknova.in/path" }]) {
    const result = await invoke({ config: { ...env, ...change } });
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { success: false, message: "Unable to submit your enquiry right now." });
    assert.equal(result.writes.length, 0);
    assert.equal(result.logs.length, 1);
    assert.ok(result.logs[0].includes("Enquiry submission failed:"));
  }
});

for (const key of ["DATABASE_ID", "LEADS_TABLE_ID", "APPWRITE_FUNCTION_API_ENDPOINT", "APPWRITE_FUNCTION_PROJECT_ID", "x-appwrite-key"]) {
  test(`missing ${key} logs its name, returns safe 500, and never writes`, async () => {
    for (const value of [undefined, "", "   "]) {
      const result = await invoke(key === "x-appwrite-key"
        ? { headers: { [key]: value } }
        : { config: { ...env, [key]: value } });
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { success: false, message: "Unable to submit your enquiry right now." });
      assert.equal(result.writes.length, 0);
      assert.equal(result.logs.length, 1);
      assert.ok(result.logs[0].includes(`Missing configuration: ${key}`));
      for (const configValue of Object.values(env)) assert.ok(!result.logs[0].includes(configValue));
      assert.ok(!result.logs[0].includes("fake-execution-key"));
    }
  });
}

test("database failures log diagnostic fields but return only safe 500 and do not retry", async () => {
  const failure = Object.assign(new Error('Invalid document structure: Unknown attribute: "deletedAt"'), {
    name: "AppwriteException", code: 400, status: 400, type: "document_invalid_structure",
    response: { secret: "never-log-this" },
  });
  const result = await invoke({ fail: failure });
  assert.equal(result.status, 500);
  assert.equal(result.writes.length, 1);
  assert.deepEqual(result.body, { success: false, message: "Unable to submit your enquiry right now." });
  assert.deepEqual(result.logs, [`Enquiry submission failed: ${JSON.stringify({
    name: failure.name, message: failure.message, code: 400, status: 400, type: failure.type,
  })}`]);
  assert.ok(!JSON.stringify(result.body).includes(failure.message));
  assert.ok(!result.logs[0].includes("never-log-this"));
});

test("diagnostic fields redact runtime keys and request credentials", async () => {
  const failure = new Error("Failure with fake-execution-key, fake-user-jwt, Bearer fake-authorization, session=fake-cookie");
  const result = await invoke({ fail: failure, headers: {
    "x-appwrite-user-jwt": "fake-user-jwt", authorization: "Bearer fake-authorization", cookie: "session=fake-cookie",
  } });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { success: false, message: "Unable to submit your enquiry right now." });
  assert.ok(result.logs[0].includes("Failure with [REDACTED], [REDACTED], [REDACTED], [REDACTED]"));
  for (const credential of ["fake-execution-key", "fake-user-jwt", "fake-authorization", "fake-cookie"]) {
    assert.ok(!result.logs[0].includes(credential));
  }
});

test("production SDK sends one private create with runtime credentials and fixed target IDs", async () => {
  const originalDispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  let requests = 0;
  let observed;
  agent.get("https://appwrite-test.invalid").intercept({
    path: "/v1/tablesdb/test-database/tables/test-leads/rows", method: "POST",
  }).reply(201, (request) => {
    requests += 1;
    observed = request;
    return { $id: "test-row", $createdAt: "test-created", $updatedAt: "test-updated" };
  });
  try {
    const handler = createHandler({ env: {
      ...env, APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite-test.invalid/v1",
      APPWRITE_FUNCTION_PROJECT_ID: "test-project",
    } });
    const result = await handler({
      req: { method: "POST", bodyText: JSON.stringify(payload), headers: {
        origin: "http://localhost:3000", "content-type": "application/json", "x-appwrite-key": "fake-execution-key",
      } },
      res: { json: (body, status) => ({ body, status }) },
    });
    assert.equal(result.status, 201);
    assert.equal(requests, 1);
    const body = JSON.parse(observed.body);
    assert.deepEqual(Object.keys(body).sort(), ["data", "permissions", "rowId"]);
    assert.deepEqual(Object.keys(body.data).sort(), ["company", "email", "message", "name", "phone", "service", "source", "status"]);
    assert.deepEqual(body.permissions, []);
    assert.equal(body.data.status, "New");
    assert.equal(Object.hasOwn(body.data, "deletedAt"), false);
    assert.equal(body.data.source, "StackNova Website");
    assert.ok(body.rowId && body.rowId !== "unique()");
    assert.equal(body.data.$id, undefined);
    assert.equal(body.data.$createdAt, undefined);
    assert.equal(body.data.$updatedAt, undefined);
    assert.equal(Object.hasOwn(body.data, "createdAt"), false);
    assert.equal(Object.hasOwn(body.data, "updatedAt"), false);
    const headers = new Headers(observed.headers);
    assert.equal(headers.get("x-appwrite-key"), "fake-execution-key");
    assert.equal(headers.get("x-appwrite-project"), "test-project");
    assert.deepEqual(Object.keys(result.body).sort(), ["message", "success"]);
    agent.assertNoPendingInterceptors();
  } finally {
    setGlobalDispatcher(originalDispatcher);
    await agent.close();
  }
});

test("production SDK createRow failure logs the actual Appwrite exception without returning it", async () => {
  const originalDispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const message = 'Invalid document structure: Missing required attribute "status"';
  agent.get("https://appwrite-test.invalid").intercept({
    path: "/v1/tablesdb/test-database/tables/test-leads/rows", method: "POST",
  }).reply(400, { message, code: 400, type: "document_invalid_structure" }, {
    headers: { "content-type": "application/json" },
  });
  try {
    const result = await invoke({ useSDK: true });
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { success: false, message: "Unable to submit your enquiry right now." });
    assert.equal(result.logs.length, 1);
    const diagnostics = JSON.parse(result.logs[0].slice("Enquiry submission failed: ".length));
    assert.equal(diagnostics.name, "AppwriteException");
    assert.equal(diagnostics.message, message);
    assert.equal(diagnostics.code, 400);
    assert.equal(diagnostics.type, "document_invalid_structure");
    assert.ok(!result.logs[0].includes("fake-execution-key"));
    assert.ok(!JSON.stringify(result.body).includes(message));
    agent.assertNoPendingInterceptors();
  } finally {
    setGlobalDispatcher(originalDispatcher);
    await agent.close();
  }
});

test("localhost CORS headers remain present on all approved-origin error responses", async () => {
  const cases = [
    { body: { ...payload, message: "" } },
    { bodyText: "{" },
    { method: "GET" },
    { headers: { "content-type": "text/plain" } },
    { body: { ...payload, message: "字".repeat(11000) } },
    { config: { ...env, DATABASE_ID: "" } },
    { fail: true },
    { method: "OPTIONS", headers: { "access-control-request-method": "GET" } },
  ];
  for (const input of cases) {
    const result = await invoke(input);
    assert.ok(result.status >= 400);
    assert.equal(result.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
    assert.equal(result.headers.Vary, "Origin");
  }
});

test("the final message including budget must stay within 4000 characters", async () => {
  const suffix = "\n\nBudget: Not sure yet";
  const validMessage = "m".repeat(4000 - suffix.length) + suffix;
  const accepted = await invoke({ body: { ...payload, message: validMessage } });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.writes[0].data.message, validMessage);
  const rejected = await invoke({ body: { ...payload, message: "m" + validMessage } });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.writes.length, 0);
});
