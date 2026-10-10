import { Client, ID, TablesDB } from "node-appwrite";
import { Resend } from "resend";
import { buildCustomerLogoAttachment } from "./email-assets.js";
import { buildCustomerConfirmationEmail, buildAdminLeadEmail } from "./email-templates.js";

const limits = { name: 100, email: 254, phone: 32, company: 150, service: 100, message: 4000 };
const singleLineControls = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const messageControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const invalidMessage = "Invalid enquiry details.";
const services = new Set([
  "Web Development", "Software Engineering", "UI/UX Design",
  "Cloud & Infrastructure", "Product Modernization", "Other",
]);
const maxBodyBytes = 32 * 1024;
const failureMessage = "Unable to submit your enquiry right now.";

// Practical single bare mailbox, not an RFC parser. Never accepts header/list syntax.
function validEmail(value) {
  return typeof value === "string" && value.length <= limits.email && !singleLineControls.test(value) &&
    /^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) &&
    value.indexOf("@") <= 64 && !value.startsWith(".") && !value.includes("..") && !value.includes(".@") &&
    value.split("@")[1].split(".").every(label => label.length <= 63);
}

// Only internally selected variable names may enter configuration diagnostics.
class ConfigurationError extends Error {
  constructor(keys, invalid = false) {
    super(`${invalid ? "Invalid" : "Missing"} configuration: ${keys.join(", ")}`);
  }
}

function allowedOrigins(value) {
  if (typeof value !== "string" || !value.trim()) throw new ConfigurationError(["ALLOWED_ORIGINS"]);
  return new Set(value.split(",").map((entry) => {
    const origin = entry.trim();
    let url;
    try { url = new URL(origin); }
    catch { throw new ConfigurationError(["ALLOWED_ORIGINS"], true); }
    if (url.origin !== origin || url.username || url.password ||
        !(url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost"))) {
      throw new ConfigurationError(["ALLOWED_ORIGINS"], true);
    }
    return origin;
  }));
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  // Allow only public fields, never caller-supplied state, IDs, timestamps, or permissions.
  if (Object.keys(body).some((key) => !Object.hasOwn(limits, key))) {
    return null;
  }
  const data = {};
  for (const [field, limit] of Object.entries(limits)) {
    const optional = field === "company";
    const input = body[field];
    if (input === undefined && optional) {
      data[field] = "";
      continue;
    }
    if (typeof input !== "string") return null;
    // Check the original input: trim must not hide header controls at either end.
    if ((field === "message" ? messageControls : singleLineControls).test(input)) return null;
    const value = input.trim();
    if ((!optional && !value) || value.length > limit) return null;
    data[field] = value;
  }
  if (!validEmail(data.email)) return null;
  const digits = data.phone.replace(/\D/g, "").length;
  if (!/^\+?[0-9 ()-]+$/.test(data.phone) || digits < 7 || digits > 15) {
    return null;
  }
  if (!services.has(data.service)) return null;
  data.source = "StackNova Website";
  data.status = "New";
  return data;
}

function verifyConfiguration(req, env) {
  const missing = [
    "DATABASE_ID", "LEADS_TABLE_ID", "APPWRITE_FUNCTION_API_ENDPOINT", "APPWRITE_FUNCTION_PROJECT_ID",
  ].filter((key) => typeof env[key] !== "string" || !env[key].trim());
  const runtimeKey = req.headers["x-appwrite-key"];
  if (typeof runtimeKey !== "string" || !runtimeKey.trim()) missing.push("x-appwrite-key");
  if (missing.length) throw new ConfigurationError(missing);
}

function errorDetails(exception) {
  if (exception instanceof ConfigurationError) return exception.message;
  // Provider text can contain customer data. Keep only fixed categories and HTTP codes.
  const details = { category: "operation_failed" };
  for (const field of ["code", "status", "statusCode"]) {
    const value = exception?.[field];
    if (Number.isInteger(value) && value >= 100 && value <= 599) {
      details[field] = value;
    }
  }
  return JSON.stringify(details);
}

// Logging must never change the result of a successfully saved enquiry.
function report(logger, message) {
  try { logger?.(message); } catch { /* Appwrite logging is best effort. */ }
}

async function sendLeadEmails({ env, data, createEmailClient, log, error }) {
  let client;
  const operations = [
    { name: "Customer confirmation", keys: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
      build: () => ({ from: `StackNova Technologies <${env.RESEND_FROM_EMAIL}>`, to: data.email,
        ...buildCustomerConfirmationEmail(data), attachments: [buildCustomerLogoAttachment()] }) },
    { name: "Admin notification", keys: ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "STACKNOVA_LEADS_EMAIL"],
      build: () => ({ from: `StackNova Technologies <${env.RESEND_FROM_EMAIL}>`, to: env.STACKNOVA_LEADS_EMAIL,
        replyTo: data.email, ...buildAdminLeadEmail(data), attachments: [buildCustomerLogoAttachment()] }) },
  ];
  const outcomes = await Promise.allSettled(operations.map(async (operation) => {
    const missing = operation.keys.filter((key) => typeof env[key] !== "string" || !env[key].trim());
    if (missing.length) throw new ConfigurationError(missing);
    const invalid = operation.keys.filter(key => key !== "RESEND_API_KEY" && !validEmail(env[key]));
    if (invalid.length) throw new ConfigurationError(invalid, true);
    // This helper is called only after writeLead resolves. No client exists before then.
    client ??= createEmailClient(env.RESEND_API_KEY);
    const result = await client.emails.send(operation.build(), { signal: AbortSignal.timeout(8000) });
    if (result.error) throw result.error;
    if (!result.data?.id) throw new Error("Email provider did not confirm acceptance");
  }));
  outcomes.forEach((outcome, index) => {
    const name = operations[index].name;
    if (outcome.status === "fulfilled") report(log, `${name} email accepted by provider.`);
    else report(error, `${name} email failed or skipped: ${errorDetails(outcome.reason)}`);
  });
}

async function createLead({ req, env, data }) {
  const endpoint = env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = env.APPWRITE_FUNCTION_PROJECT_ID;
  const key = req.headers["x-appwrite-key"];
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key);
  await new TablesDB(client).createRow({
    databaseId: env.DATABASE_ID, tableId: env.LEADS_TABLE_ID,
    rowId: ID.unique(), data, permissions: [],
  });
}

// Dependencies are injectable for tests. HTTP callers cannot provide env or a database writer.
export function createHandler({ env = process.env, writeLead = createLead,
  createEmailClient = (key) => new Resend(key) } = {}) {
  return async ({ req, res, log, error }) => {
    const headers = { "Vary": "Origin", "Cache-Control": "no-store" };
    const reply = (status, message) => res.json({ success: false, message }, status, headers);
    let data;
    try {
      const origins = allowedOrigins(env.ALLOWED_ORIGINS);
      const origin = req.headers.origin;
      if (!origin || !origins.has(origin)) return reply(403, "This origin is not allowed.");
      headers["Access-Control-Allow-Origin"] = origin;

      if (req.method === "OPTIONS") {
        const requestedHeaders = (req.headers["access-control-request-headers"] || "")
          .split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
        if (req.headers["access-control-request-method"] !== "POST" ||
            requestedHeaders.some((header) => header !== "content-type")) {
          return reply(403, "This request is not allowed.");
        }
        headers["Access-Control-Allow-Methods"] = "POST";
        headers["Access-Control-Allow-Headers"] = "Content-Type";
        return res.text("", 204, headers);
      }
      if (req.method !== "POST") {
        headers.Allow = "POST, OPTIONS";
        return reply(405, "Please submit your enquiry using POST.");
      }
      if ((req.headers["content-type"] || "").split(";")[0].trim().toLowerCase() !== "application/json") {
        return reply(415, "Please send your enquiry as JSON.");
      }
      if (typeof req.bodyText !== "string") return reply(400, invalidMessage);
      if (Buffer.byteLength(req.bodyText, "utf8") > maxBodyBytes) {
        return reply(413, "Your enquiry is too large.");
      }
      let body;
      try { body = JSON.parse(req.bodyText); }
      catch { return reply(400, invalidMessage); }
      const result = validate(body);
      if (!result) return reply(400, invalidMessage);
      verifyConfiguration(req, env);
      // Exactly one private create; never attempt email before this completes successfully.
      await writeLead({ req, env, data: result });
      data = result;
    } catch (exception) {
      report(error, `Enquiry submission failed: ${errorDetails(exception)}`);
      return reply(500, failureMessage);
    }
    // Database storage is primary. Email/configuration failures cannot enter the 500 path above.
    try { await sendLeadEmails({ env, data, createEmailClient, log, error }); }
    catch { report(error, "Email processing failed after lead was saved."); }
    return res.json({
      success: true, message: "Thank you! Your enquiry has been submitted successfully.",
    }, 201, headers);
  };
}

export default createHandler();
