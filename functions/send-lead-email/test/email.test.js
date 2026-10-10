import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFileSync } from "node:fs";
import { buildLeadMessageEmail } from "../src/email-template.js";
import { buildLogoAttachment } from "../src/email-assets.js";

test("direct message has light branded shell, direct wording, service, signature and footer", () => {
  const email = buildLeadMessageEmail({ name: "Ankit", service: "Web Development", subject: "Quotation", message: "Your project update" });
  assert.equal(email.subject, "Quotation");
  for (const value of ["STACKNOVA MESSAGE", "Message from StackNova Technologies", "Hi Ankit,", "Your project update", "YOUR PROJECT / SERVICE", "Web Development", "Best regards,", "The StackNova Technologies Team", "Thoughtful engineering. Clear communication.", "All rights reserved."])
    assert.ok(email.html.includes(value), value);
  assert.match(email.html, /bgcolor="#F4F7FA"/); assert.match(email.html, /bgcolor="#FFFFFF"/); assert.match(email.html, /border-top:4px solid #06B6D4/);
  assert.match(email.html, /max-width:600px/); assert.match(email.html, /cid:stacknova-logo/);
  assert.doesNotMatch(email.html + email.text, /ENQUIRY RECEIVED|Thanks for reaching out|review your requirements|technical consultant/);
  assert.match(email.text, /Hi Ankit,\n\nYour project update\n\nService: Web Development/);
  assert.doesNotMatch(email.text, /<table|<img|<p\b/);
});
test("all dynamic HTML escaped before line breaks are converted; plaintext preserves original message", () => {
  const message = '<script>alert(1)</script>\r\nA & B\r<img src=x onerror="bad">\n\nLast';
  const email = buildLeadMessageEmail({ name: '<b>"Name"</b>', service: "<svg>'Service' &", subject: "Custom subject", message });
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;<br>A &amp; B<br>&lt;img/);
  assert.match(email.html, /&quot;bad&quot;&gt;<br><br>Last/);
  assert.match(email.html, /&lt;b&gt;&quot;Name&quot;&lt;\/b&gt;/); assert.match(email.html, /&lt;svg&gt;&#39;Service&#39; &amp;/);
  assert.doesNotMatch(email.html, /<script>|<svg>|<img src=x|<b>/); assert.equal((email.html.match(/<img\b/g) || []).length, 1);
  assert.ok(email.text.includes(message));
});
test("copyright uses current year on every invocation", () => {
  const clock = mock.method(Date.prototype, "getFullYear", () => 2032);
  try { const email = buildLeadMessageEmail({ name: "Name", service: "Service", subject: "Subject", message: "Message" });
    assert.ok(email.html.includes("\u00a9 2032")); assert.ok(email.text.includes("\u00a9 2032"));
  } finally { clock.mock.restore(); }
});
test("CID logo bytes match the existing approved logo and deploy independently", () => {
  const attachment = buildLogoAttachment(); assert.equal(attachment.contentId, "stacknova-logo"); assert.equal(attachment.contentType, "image/png");
  assert.deepEqual(Buffer.from(attachment.content, "base64"), readFileSync(new URL("../assets/stacknova-logo.png", import.meta.url)));
  assert.deepEqual(Buffer.from(attachment.content, "base64"), readFileSync(new URL("../../submit-enquiry/assets/stacknova-logo.png", import.meta.url)));
});

test("direct-message larger CID logo is nested inside the white main card", () => {
  const email=buildLeadMessageEmail({name:"Name",service:"Service",subject:"Subject",message:"Message"});
  const stack=[]; let logos=0;
  for(const [tag] of email.html.matchAll(/<\/?[a-z][^>]*>/gi)){
    const name=tag.match(/^<\/?([a-z0-9]+)/i)[1].toLowerCase();
    if(tag.startsWith("</")){const index=stack.map(item=>item.name).lastIndexOf(name);if(index>=0)stack.splice(index);continue;}
    if(name==="img" && tag.includes("cid:stacknova-logo")){logos++;assert.ok(stack.some(item=>item.tag.includes('class="email-card"') && item.tag.includes('bgcolor="#FFFFFF"')));assert.match(tag,/width="210" height="70"/);}
    if(!["img","meta","br","link","hr"].includes(name))stack.push({name,tag});
  }
  assert.equal(logos,1);assert.match(email.html,/border-radius:14px/);assert.match(email.html,/bgcolor="#F4F7FA"/);
});
