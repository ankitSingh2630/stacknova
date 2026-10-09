import { Client, ID, TablesDB } from "node-appwrite";

const limits = { name: 100, email: 254, phone: 32, company: 150, service: 100, message: 4000, source: 100 };
const services = new Set([
  "Web Development", "Software Engineering", "UI/UX Design",
  "Cloud & Infrastructure", "Product Modernization", "Other",
]);
const maxBodyBytes = 32 * 1024;
const failureMessage = "Unable to submit your enquiry right now.";

function allowedOrigins(value) {
  if (!value?.trim()) throw new Error("Missing configuration: ALLOWED_ORIGINS");
  return new Set(value.split(",").map((entry) => {
    const origin = entry.trim();
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password ||
        !(url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost"))) {
      throw new Error("Invalid origin configuration");
    }
    return origin;
  }));
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { message: "Please send a valid enquiry." };
  }
  // Allow only public fields, never caller-supplied state, IDs, timestamps, or permissions.
  if (Object.keys(body).some((key) => !Object.hasOwn(limits, key))) {
    return { message: "The enquiry contains unsupported fields." };
  }
  const data = {};
  for (const [field, limit] of Object.entries(limits)) {
    const optional = field === "company" || field === "source";
    const input = body[field];
    if (input === undefined && optional) {
      data[field] = "";
      continue;
    }
    if (typeof input !== "string") return { message: `Please enter ${field}.` };
    const value = input.trim();
    if (!optional && !value) return { message: `Please enter ${field}.` };
    if (value.length > limit) return { message: `${field} must be ${limit} characters or fewer.` };
    // Allow multiline messages; reject control characters elsewhere and unsafe controls everywhere.
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) ||
        (field !== "message" && /[\r\n\t]/.test(value))) {
      return { message: "The enquiry contains invalid characters." };
    }
    data[field] = value;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { message: "Please enter a valid email address." };
  }
  const digits = data.phone.replace(/\D/g, "").length;
  if (!/^\+?[0-9 ()-]+$/.test(data.phone) || digits < 7 || digits > 15) {
    return { message: "Please enter a valid phone number with 7–15 digits." };
  }
  if (!services.has(data.service)) return { message: "Please select a supported project type." };
  data.source = "StackNova Website";
  data.status = "New";
  return { data };
}

function verifyConfiguration(req, env) {
  const missing = [
    "DATABASE_ID", "LEADS_TABLE_ID", "APPWRITE_FUNCTION_API_ENDPOINT", "APPWRITE_FUNCTION_PROJECT_ID",
  ].filter((key) => typeof env[key] !== "string" || !env[key].trim());
  const runtimeKey = req.headers["x-appwrite-key"];
  if (typeof runtimeKey !== "string" || !runtimeKey.trim()) missing.push("x-appwrite-key");
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
}

function errorDetails(exception, req) {
  // Whitelist scalar diagnostics, never serialize the exception, response, or request.
  const credentials = ["x-appwrite-key", "x-appwrite-user-jwt", "authorization", "cookie"]
    .map((header) => req.headers[header]).filter((value) => typeof value === "string" && value);
  const details = {};
  for (const field of ["name", "message", "code", "status", "type"]) {
    const value = exception?.[field];
    if (typeof value === "string") {
      details[field] = credentials.reduce((text, credential) => text.replaceAll(credential, "[REDACTED]"), value);
    } else if (typeof value === "number") {
      details[field] = value;
    }
  }
  if (!Object.keys(details).length) details.message = "Unknown error";
  return JSON.stringify(details);
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
export function createHandler({ env = process.env, writeLead = createLead } = {}) {
  return async ({ req, res, error }) => {
    const headers = { "Vary": "Origin", "Cache-Control": "no-store" };
    const reply = (status, message) => res.json({ success: false, message }, status, headers);
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
      if (typeof req.bodyText !== "string") return reply(400, "Please send valid JSON.");
      if (Buffer.byteLength(req.bodyText, "utf8") > maxBodyBytes) {
        return reply(413, "Your enquiry is too large.");
      }
      let body;
      try { body = JSON.parse(req.bodyText); }
      catch { return reply(400, "Please send valid JSON."); }
      const result = validate(body);
      if (result.message) return reply(400, result.message);
      verifyConfiguration(req, env);
      // Exactly one create, no retries, reads, updates, notes, or email operations.
      await writeLead({ req, env, data: result.data });
      return res.json({
        success: true, message: "Thank you! Your enquiry has been submitted successfully.",
      }, 201, headers);
    } catch (exception) {
      error?.(`Enquiry submission failed: ${errorDetails(exception, req)}`);
      return reply(500, failureMessage);
    }
  };
}

export default createHandler();
