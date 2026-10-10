import { appwriteConfig } from "./appwrite/config";

export const enquiryServices = [
  "Web Development", "Software Engineering", "UI/UX Design",
  "Cloud & Infrastructure", "Product Modernization", "Other",
] as const;

export const enquiryLimits = {
  name: 100, email: 254, phone: 32, company: 150,
  service: 100, message: 4000,
} as const;

export type EnquiryPayload = {
  name: string; email: string; phone: string; company?: string;
  service: string; message: string;
};
export type EnquiryResponse = { success: boolean; message: string };
export type EnquiryErrors = Partial<Record<keyof EnquiryPayload, string>>;
const failureMessage = "Unable to submit your enquiry right now. Please try again later.";
const singleLineControls = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const messageControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

// Keep this small UX check aligned with the independently deployed Function.
function validEmail(value: string) {
  return value.length <= enquiryLimits.email && !singleLineControls.test(value) &&
    /^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) &&
    value.indexOf("@") <= 64 && !value.startsWith(".") && !value.includes("..") && !value.includes(".@") &&
    value.split("@")[1].split(".").every(label => label.length <= 63);
}

export function validateEnquiry(payload: EnquiryPayload): EnquiryErrors {
  const errors: EnquiryErrors = {};
  const labels = { name: "Name", email: "Email", phone: "Phone", company: "Company", service: "Project type", message: "Message" };
  for (const field of Object.keys(enquiryLimits) as (keyof EnquiryPayload)[]) {
    const input = payload[field];
    if (field === "company" && input === undefined) continue;
    if (typeof input !== "string") {
      errors[field] = `Please enter ${labels[field].toLowerCase()}.`;
      continue;
    }
    const value = input.trim();
    if ((field === "message" ? messageControls : singleLineControls).test(input)) {
      errors[field] = `${labels[field]} contains invalid characters.`;
    } else if (field !== "company" && !value) {
      errors[field] = `Please enter ${labels[field].toLowerCase()}.`;
    } else if (value.length > enquiryLimits[field]) {
      errors[field] = `${labels[field]} must be ${enquiryLimits[field]} characters or fewer${field === "message" ? ", including the selected budget" : ""}.`;
    }
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const selectedService = typeof payload.service === "string" ? payload.service.trim() : "";
  if (email && !validEmail(email)) {
    errors.email = "Please enter a valid email address.";
  }
  const digits = phone.replace(/\D/g, "").length;
  if (phone && (!/^\+?[0-9 ()-]+$/.test(phone) || digits < 7 || digits > 15)) {
    errors.phone = "Please enter a valid phone number with 7–15 digits.";
  }
  if (selectedService && !enquiryServices.some((service) => service === selectedService)) {
    errors.service = "Please select a project type.";
  }
  return errors;
}

// Only display recognized messages; infrastructure errors must never reach the UI.
const safeValidationMessages = new Set([
  "Invalid enquiry details.",
  "Please enter name.", "Please enter email.", "Please enter phone.",
  "Please enter service.", "Please enter message.",
  "Please enter a valid email address.",
  "Please enter a valid phone number with 7–15 digits.",
  "Please select a supported project type.",
  ...Object.entries(enquiryLimits).map(([field, limit]) => `${field} must be ${limit} characters or fewer.`),
]);

// Always resolves to a safe response, including unexpected request-setup exceptions.
// Contact relies on this boundary rather than duplicating network error handling.
export async function submitEnquiry(payload: EnquiryPayload): Promise<EnquiryResponse> {
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const requestController = new AbortController();
    controller = requestController;
    timeout = setTimeout(() => requestController.abort(), 35000);
    const url = new URL(appwriteConfig.enquiryFunctionUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid function URL");
    const response = await fetch(url.toString(), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), credentials: "omit", cache: "no-store",
      redirect: "error", signal: controller.signal,
    });
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null ||
        !("success" in result) || !("message" in result) ||
        typeof result.success !== "boolean" || typeof result.message !== "string") {
      throw new Error("Invalid function response");
    }
    if (response.status === 201 && result.success === true &&
        result.message === "Thank you! Your enquiry has been submitted successfully.") {
      return { success: true, message: result.message };
    }
    if (response.status === 400 && result.success === false && safeValidationMessages.has(result.message)) {
      return { success: false, message: result.message };
    }
    return { success: false, message: failureMessage };
  } catch {
    return { success: false, message: controller?.signal.aborted
      ? "We could not confirm your submission. It may have been received; please wait before trying again."
      : failureMessage };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
