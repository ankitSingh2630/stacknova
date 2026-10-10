import { customerLogoContentId } from "./email-assets.js";

// Submitted text is always escaped before it becomes HTML, including table values.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function layout(title, content) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>@media only screen and (max-width:480px){.email-card{padding:32px 24px!important;}.email-logo{width:210px!important;height:auto!important;max-width:100%!important;}}</style></head>
<body style="margin:0;padding:0;background-color:#F4F7FA;color:#0F172A;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F7FA">
    <tr><td align="center" style="padding:40px 12px 24px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;table-layout:fixed;">
        <tr><td class="email-card" bgcolor="#FFFFFF" style="padding:40px;border:1px solid #DCE5EF;border-top:4px solid #06B6D4;border-radius:14px;word-break:break-word;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 40px;">
            <img class="email-logo" src="cid:${customerLogoContentId}" alt="StackNova Technologies" width="210" height="70" border="0" style="display:block;width:210px;height:70px;max-width:100%;">
          </td></tr></table>
          ${content}
        </td></tr>
        <tr><td class="email-footer" align="center" style="padding:40px 16px 0;">
          <table role="presentation" width="48" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#CBD5E1" style="font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
          <p style="margin:16px 0 4px;font-size:13px;font-weight:bold;line-height:20px;color:#475569;">StackNova Technologies</p>
          <p style="margin:0;font-size:12px;line-height:20px;color:#64748B;">Thoughtful engineering. Clear communication.</p>
          <p style="margin:24px 0 0;font-size:10px;line-height:18px;color:#64748B;">© ${year} StackNova Technologies. All rights reserved.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildCustomerConfirmationEmail({ name, service }) {
  const year = new Date().getFullYear();
  const subject = "We received your enquiry — StackNova Technologies";
  const html = layout("Enquiry received — StackNova Technologies", `
          <p style="margin:0 0 20px;"><span style="padding:5px 10px;border:1px solid #A5DEFF;border-radius:14px;background-color:#F0F9FF;color:#0078B8;font-size:11px;font-weight:bold;line-height:22px;letter-spacing:0.8px;">&#9679; ENQUIRY RECEIVED</span></p>
          <h1 style="margin:0 0 24px;font-size:28px;line-height:36px;letter-spacing:-0.6px;color:#0F172A;">Thanks for reaching out</h1>
          <p style="margin:0 0 18px;font-size:16px;font-weight:bold;line-height:26px;color:#0F172A;">Hi ${escapeHtml(name)},</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#475569;">Thanks for reaching out to StackNova Technologies. We’ve received your enquiry and appreciate you sharing your requirements with us.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F9FC" style="border:1px solid #DCE5EF;border-left:4px solid #0EA5E9;border-radius:8px;">
            <tr>
              <td style="padding:18px 16px;word-break:break-word;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:bold;line-height:18px;letter-spacing:0.5px;color:#64748B;">YOUR SELECTED SERVICE</p>
                <p style="margin:0;font-size:18px;font-weight:bold;line-height:26px;color:#0F172A;">${escapeHtml(service)}</p>
              </td>
              <td width="44" align="center" valign="middle" style="padding:12px 16px 12px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#FFFFFF" style="padding:7px;border:1px solid #DCE5EF;border-radius:8px;font-family:Consolas,monospace;font-size:16px;line-height:20px;color:#0284C7;">&lt;/&gt;</td></tr></table></td>
            </tr>
          </table>
          <p style="margin:24px 0 18px;font-size:16px;line-height:26px;color:#475569;">Our team will review your requirements and get back to you shortly.<br>A dedicated technical consultant usually follows up within 1 business day.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:20px;border-top:1px solid #EDF2F7;">
            <p style="margin:0 0 4px;font-size:14px;line-height:24px;color:#64748B;">Best regards,</p>
            <p style="margin:0;font-size:14px;font-weight:bold;line-height:24px;color:#0F172A;">The StackNova Technologies Team</p>
          </td></tr></table>`);
  const text = `ENQUIRY RECEIVED

Thanks for reaching out

Hi ${name},

Thanks for reaching out to StackNova Technologies. We’ve received your enquiry and appreciate you sharing your requirements with us.

YOUR SELECTED SERVICE
${service}

Our team will review your requirements and get back to you shortly.
A dedicated technical consultant usually follows up within 1 business day.

Best regards,
The StackNova Technologies Team

StackNova Technologies
Thoughtful engineering. Clear communication.
© ${year} StackNova Technologies. All rights reserved.`;
  return { subject, html, text };
}

export function buildAdminLeadEmail({ name, email, phone, company, service, message, source }) {
  const year = new Date().getFullYear();
  const subject = `New Website Enquiry — ${service} — ${name}`;
  const fields = [
    ["Name", name], ["Email", email], ["Phone", phone],
    ["Company", company || "Not provided"], ["Service", service],
    ["Source", source], ["Status", "New"],
  ];
  const rows = fields.map(([label, value]) => `<tr>
    <th scope="row" width="90" align="left" valign="top" style="padding:12px 16px;border-bottom:1px solid #DCE5EF;font-size:12px;font-weight:normal;line-height:22px;color:#64748B;">${label}</th>
    <td valign="top" style="padding:12px 16px;border-bottom:1px solid #DCE5EF;font-size:14px;line-height:22px;word-break:break-word;color:#0F172A;">${escapeHtml(value)}</td>
  </tr>`).join("");
  const html = layout("New Lead Received — StackNova Technologies", `
    <p style="margin:0 0 20px;"><span style="padding:5px 10px;border:1px solid #A5DEFF;border-radius:14px;background-color:#F0F9FF;color:#0078B8;font-size:11px;font-weight:bold;line-height:22px;letter-spacing:0.8px;">&#9679; NEW WEBSITE ENQUIRY</span></p>
    <h1 style="margin:0 0 24px;font-size:28px;line-height:36px;letter-spacing:-0.6px;color:#0F172A;">New Lead Received</h1>
    <p style="margin:0 0 20px;"><span style="padding:5px 10px;border:1px solid #A5DEFF;border-radius:8px;background-color:#F0F9FF;color:#0078B8;font-size:12px;font-weight:bold;line-height:22px;">New</span></p>
    <table aria-label="Lead information" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F9FC" style="border:1px solid #DCE5EF;border-left:4px solid #0EA5E9;border-radius:8px;table-layout:fixed;">${rows}</table>
    <h2 style="margin:24px 0 12px;font-size:16px;line-height:24px;color:#0F172A;">Message / Project Description</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F9FC"><tr><td style="padding:18px 16px;border:1px solid #DCE5EF;border-left:4px solid #0EA5E9;border-radius:8px;font-size:14px;line-height:24px;word-break:break-word;color:#475569;">${escapeHtml(message).replace(/\r\n|\r|\n/g, "<br>")}</td></tr></table>
    <p style="margin:24px 0;font-size:14px;line-height:24px;color:#475569;">Reply to this email to respond directly to the customer.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:20px;border-top:1px solid #EDF2F7;">
      <p style="margin:0 0 4px;font-size:14px;line-height:24px;color:#64748B;">Best regards,</p>
      <p style="margin:0;font-size:14px;font-weight:bold;line-height:24px;color:#0F172A;">The StackNova Technologies Team</p>
    </td></tr></table>`);
  const text = `New Lead Received

${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}

Message / Project Description:
${message}

Reply to this email to respond directly to the customer.

Best regards,
The StackNova Technologies Team

StackNova Technologies
Thoughtful engineering. Clear communication.
© ${year} StackNova Technologies. All rights reserved.`;
  return { subject, html, text };
}
