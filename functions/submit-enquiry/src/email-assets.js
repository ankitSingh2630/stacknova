import { readFileSync } from "node:fs";

export const customerLogoContentId = "stacknova-logo";

// Called only when building the customer/admin send operations after the lead is saved.
// The deployment includes this asset; no website or design-reference path is needed.
export function buildCustomerLogoAttachment() {
  return {
    filename: "stacknova-logo.png",
    // Explicit base64 is required on the send API wire; this SDK passes content through.
    content: readFileSync(new URL("../assets/stacknova-logo.png", import.meta.url)).toString("base64"),
    contentType: "image/png",
    contentId: customerLogoContentId,
  };
}
