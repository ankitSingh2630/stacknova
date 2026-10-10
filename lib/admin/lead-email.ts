import { ExecutionMethod, type Functions } from "appwrite";
import { validLeadId } from "./leads";

export const emailFailureMessage = "Unable to send email right now.";
export type EmailResult = { ok: true } | { ok: false; kind: "validation" | "session" | "access" | "failure"; message: string; field?: "cc" | "bcc" };
export const MAX_COPY_RECIPIENTS = 10;
const recipientControls = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
// Same bare-mailbox validation as the independently deployed Function.
function validEmail(value: string) {
  return value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) &&
    value.indexOf("@") <= 64 && !value.startsWith(".") && !value.includes("..") && !value.includes(".@");
}
export function parseEmailRecipients(value: unknown, field: "cc" | "bcc"):
  { ok: true; addresses: string[] } | Exclude<EmailResult, { ok: true }> {
  const invalid = (): Exclude<EmailResult, { ok: true }> => ({ ok: false, kind: "validation", field, message: `Enter valid ${field.toUpperCase()} email addresses (maximum 10).` });
  if (typeof value !== "string" || recipientControls.test(value)) return invalid();
  if (!value.trim()) return { ok: true, addresses: [] };
  const entries = value.split(",");
  if (entries.length > MAX_COPY_RECIPIENTS) return invalid();
  const addresses = new Map<string, string>();
  for (const entry of entries) {
    const address = entry.trim();
    if (!validEmail(address)) return invalid();
    const key = address.toLowerCase();
    if (!addresses.has(key)) addresses.set(key, address);
  }
  return { ok: true, addresses: Array.from(addresses.values()) };
}
export function validateLeadEmail(leadId: unknown, subject: unknown, message: unknown, cc: unknown = "", bcc: unknown = ""):
  { ok: true; data: { leadId: string; subject: string; message: string; cc?: string[]; bcc?: string[] } } | Exclude<EmailResult, { ok: true }> {
  const invalid = (message: string): Exclude<EmailResult, { ok: true }> => ({ ok: false, kind: "validation", message });
  if (!validLeadId(leadId)) return invalid(emailFailureMessage);
  if (typeof subject !== "string" || !subject.trim()) return invalid("Please enter a subject.");
  if (typeof message !== "string" || !message.trim()) return invalid("Please enter a message.");
  const cleanSubject = subject.trim(), cleanMessage = message.trim();
  if (cleanSubject.length > 200) return invalid("Subject must be 200 characters or fewer.");
  if (cleanMessage.length > 10000) return invalid("Message must be 10,000 characters or fewer.");
  if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(subject)) return invalid("Subject must not contain line breaks or control characters.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(message)) return invalid("Message contains invalid control characters.");
  const copies = parseEmailRecipients(cc, "cc"), blindCopies = parseEmailRecipients(bcc, "bcc");
  if (!copies.ok) return copies;
  if (!blindCopies.ok) return blindCopies;
  const hidden = new Set(blindCopies.addresses.map(address => address.toLowerCase()));
  const visible = copies.addresses.filter(address => !hidden.has(address.toLowerCase()));
  return { ok: true, data: { leadId, subject: cleanSubject, message: cleanMessage,
    ...(visible.length ? { cc: visible } : {}), ...(blindCopies.addresses.length ? { bcc: blindCopies.addresses } : {}) } };
}

export function createLeadEmailSender({ functions, config }: {
  functions: Pick<Functions, "createExecution">; config: { sendLeadEmailFunctionId: string };
}) {
  return async (leadId: string, subject: string, message: string, cc = "", bcc = ""): Promise<EmailResult> => {
    const validated = validateLeadEmail(leadId, subject, message, cc, bcc);
    if (!validated.ok) return validated;
    if (!config.sendLeadEmailFunctionId.trim()) return { ok: false, kind: "failure", message: emailFailureMessage };
    try {
      const execution = await functions.createExecution({
        functionId: config.sendLeadEmailFunctionId, body: JSON.stringify(validated.data), async: false,
        xpath: "/", method: ExecutionMethod.POST, headers: { "content-type": "application/json" },
      });
      if (execution.status !== "completed") throw new Error("Unconfirmed send");
      if (execution.responseStatusCode === 401 || execution.responseStatusCode === 403)
        return { ok: false, kind: execution.responseStatusCode === 401 ? "session" : "access", message: emailFailureMessage };
      if (execution.responseStatusCode !== 200) throw new Error("Unconfirmed send");
      const result: unknown = JSON.parse(execution.responseBody);
      if (!result || typeof result !== "object" || !("success" in result) || result.success !== true) throw new Error("Unconfirmed send");
      return { ok: true };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      return { ok: false, kind: code === 401 ? "session" : code === 403 ? "access" : "failure", message: emailFailureMessage };
    }
  };
}
