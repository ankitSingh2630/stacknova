import { readFileSync } from "node:fs";

export const logoContentId = "stacknova-logo";
export function buildLogoAttachment() {
  return {
    filename: "stacknova-logo.png",
    content: readFileSync(new URL("../assets/stacknova-logo.png", import.meta.url)).toString("base64"),
    contentType: "image/png",
    contentId: logoContentId,
  };
}
