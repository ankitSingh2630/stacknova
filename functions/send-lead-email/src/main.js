import { Client, TablesDB } from "node-appwrite";
import { Resend } from "resend";
import { buildLeadMessageEmail } from "./email-template.js";
import { buildLogoAttachment } from "./email-assets.js";

const failureMessage = "Unable to send email right now.";
const unavailableMessage = "This lead is no longer available.";
const maxBodyBytes = 64 * 1024;
const unsafeControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const validId = value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(value);
// Exactly one bare mailbox. Reject display names, lists, whitespace, and header controls.
export const validEmail = value => typeof value === "string" && value.length <= 254 &&
  /^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) &&
  value.indexOf("@") <= 64 && !value.startsWith(".") && !value.includes("..") && !value.includes(".@");

function normalizeRecipients(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const addresses = new Map();
  for (const entry of value) {
    if (typeof entry !== "string" || /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(entry)) return null;
    const address = entry.trim();
    if (!validEmail(address)) return null;
    const key = address.toLowerCase();
    if (!addresses.has(key)) addresses.set(key, address);
  }
  return [...addresses.values()];
}

export function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["leadId", "subject", "message", "cc", "bcc"].includes(key))) return null;
  if (!validId(body.leadId) || typeof body.subject !== "string" || typeof body.message !== "string") return null;
  const subject = body.subject.trim(), message = body.message.trim();
  if (!subject || subject.length > 200 || /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(body.subject) ||
      !message || message.length > 10000 || unsafeControls.test(body.message)) return null;
  const cc = normalizeRecipients(body.cc), bcc = normalizeRecipients(body.bcc);
  if (!cc || !bcc) return null;
  const hidden = new Set(bcc.map(address => address.toLowerCase()));
  return { leadId: body.leadId, subject, message, cc: cc.filter(address => !hidden.has(address.toLowerCase())), bcc };
}

async function readLead({ req, env, leadId }) {
  const client = new Client().setEndpoint(env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(env.APPWRITE_FUNCTION_PROJECT_ID).setKey(req.headers["x-appwrite-key"]);
  return new TablesDB(client).getRow({ databaseId: env.DATABASE_ID, tableId: env.LEADS_TABLE_ID, rowId: leadId });
}
function report(logger, message) { try { logger?.(message); } catch { /* Logging cannot change send outcome. */ } }

// Dependencies are injectable for tests, never from the request payload.
export function createHandler({ env = process.env, loadLead = readLead, createEmailClient = key => new Resend(key) } = {}) {
  return async ({ req, res, log, error }) => {
    const headers = { "Cache-Control": "no-store" };
    const reply = (status, message = failureMessage) => res.json({ success: false, message }, status, headers);
    // Appwrite's team-only Execute access is the authorization boundary.
    // Require runtime user context too; no credentials are accepted in the body.
    if (typeof req.headers["x-appwrite-user-id"] !== "string" || !req.headers["x-appwrite-user-id"].trim()) return reply(401);
    if (req.method !== "POST") return reply(405);
    if ((req.headers["content-type"] || "").split(";")[0].trim().toLowerCase() !== "application/json") return reply(415);
    if (typeof req.bodyText !== "string") return reply(400);
    if (Buffer.byteLength(req.bodyText, "utf8") > maxBodyBytes) return reply(413);
    let data;
    try { data = validate(JSON.parse(req.bodyText)); } catch { return reply(400); }
    if (!data) return reply(400);
    try {
      for (const key of ["DATABASE_ID", "LEADS_TABLE_ID", "APPWRITE_FUNCTION_API_ENDPOINT", "APPWRITE_FUNCTION_PROJECT_ID", "RESEND_API_KEY", "RESEND_FROM_EMAIL"]) {
        if (typeof env[key] !== "string" || !env[key].trim()) throw new Error("Missing configuration");
      }
      if (!req.headers["x-appwrite-key"]?.trim() || !validEmail(env.RESEND_FROM_EMAIL)) throw new Error("Invalid configuration");
      let lead;
      try { lead = await loadLead({ req, env, leadId: data.leadId }); }
      catch (exception) { if (exception?.code === 404) return reply(404, unavailableMessage); throw exception; }
      if (!lead || lead.$id !== data.leadId) throw new Error("Invalid lead response");
      // Fail closed for any populated deletion marker, including malformed stored values.
      if (lead.deletedAt !== undefined && lead.deletedAt !== null && lead.deletedAt !== "") return reply(404, unavailableMessage);
      if (!validEmail(lead.email) || typeof lead.name !== "string" || !lead.name.trim() ||
          typeof lead.service !== "string" || !lead.service.trim()) return reply(422);
      const primary = lead.email.toLowerCase();
      const cc = data.cc.filter(address => address.toLowerCase() !== primary);
      const bcc = data.bcc.filter(address => address.toLowerCase() !== primary);
      const email = {
        from: `StackNova Technologies <${env.RESEND_FROM_EMAIL}>`, to: [lead.email],
        ...(cc.length ? { cc } : {}), ...(bcc.length ? { bcc } : {}),
        ...buildLeadMessageEmail({ name: lead.name, service: lead.service, subject: data.subject, message: data.message }),
        attachments: [buildLogoAttachment()],
      };
      const result = await createEmailClient(env.RESEND_API_KEY).emails.send(email, { signal: AbortSignal.timeout(8000) });
      if (result?.error || typeof result?.data?.id !== "string" || !result.data.id.trim()) throw new Error("Unconfirmed email acceptance");
      report(log, "Lead email accepted by provider.");
      return res.json({ success: true, message: "Email sent successfully." }, 200, headers);
    } catch {
      // Never log raw provider/database errors, body, addresses, messages, or credentials.
      report(error, "Lead email failed or could not be confirmed.");
      return reply(500);
    }
  };
}

export default createHandler();
