// Submitted text is always escaped before it becomes HTML, including table values.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function layout(title, content) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:#070B14;color:#F8FAFC;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070B14">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
        <tr><td style="padding:8px 24px 24px;font-size:20px;font-weight:bold;letter-spacing:0.5px;color:#F8FAFC;">Stack<span style="color:#06B6D4;">Nova</span><br><span style="font-size:11px;font-weight:normal;letter-spacing:2px;color:#94A3B8;">TECHNOLOGIES</span></td></tr>
        <tr><td bgcolor="#0B1020" style="padding:28px 24px;border:1px solid #253047;border-top:3px solid #2563EB;word-break:break-word;">
          ${content}
        </td></tr>
        <tr><td style="padding:24px;font-size:12px;line-height:20px;color:#94A3B8;">StackNova Technologies<br>Thoughtful engineering. Clear communication.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildCustomerConfirmationEmail({ name, service }) {
  const subject = "We received your enquiry — StackNova Technologies";
  const html = layout("Enquiry received — StackNova Technologies", `
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:2px;color:#06B6D4;">ENQUIRY RECEIVED</p>
    <h1 style="margin:0 0 24px;font-size:28px;line-height:36px;color:#F8FAFC;">Thanks for reaching out</h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#F8FAFC;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#CBD5E1;">Thanks for reaching out to StackNova Technologies. We've received your enquiry and appreciate you sharing your requirements with us.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#090D18">
      <tr><td style="padding:18px;border-left:3px solid #06B6D4;"><p style="margin:0 0 8px;font-size:11px;letter-spacing:1px;color:#94A3B8;">YOUR SELECTED SERVICE</p><p style="margin:0;font-size:17px;line-height:26px;color:#F8FAFC;">${escapeHtml(service)}</p></td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:16px;line-height:26px;color:#CBD5E1;">Our team will review your requirements and get back to you shortly.</p>
    <p style="margin:24px 0 0;font-size:14px;line-height:24px;color:#F8FAFC;">Best regards,<br><strong>The StackNova Technologies team</strong></p>`);
  const text = `Hi ${name},

Thanks for reaching out to StackNova Technologies. We've received your enquiry for ${service} and appreciate you sharing your requirements with us.

Our team will review your requirements and get back to you shortly.

Best regards,
The StackNova Technologies team`;
  return { subject, html, text };
}

export function buildAdminLeadEmail({ name, email, phone, company, service, message, source }) {
  const subject = `New Website Enquiry — ${service} — ${name}`;
  const fields = [
    ["Name", name], ["Email", email], ["Phone", phone],
    ["Company", company || "Not provided"], ["Service", service],
    ["Source", source], ["Status", "New"],
  ];
  const rows = fields.map(([label, value]) => `<tr>
    <th scope="row" width="80" align="left" valign="top" style="padding:12px 8px 12px 0;border-bottom:1px solid #253047;font-size:12px;font-weight:normal;line-height:22px;color:#94A3B8;">${label}</th>
    <td valign="top" style="padding:12px 0;border-bottom:1px solid #253047;font-size:14px;line-height:22px;word-break:break-word;color:#F8FAFC;">${escapeHtml(value)}</td>
  </tr>`).join("");
  const html = layout("New Lead Received — StackNova Technologies", `
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:2px;color:#06B6D4;">WEBSITE ENQUIRY</p>
    <h1 style="margin:0 0 16px;font-size:28px;line-height:36px;color:#F8FAFC;">New Lead Received</h1>
    <p style="margin:0 0 20px;"><span style="display:inline-block;padding:5px 12px;background-color:#103346;border:1px solid #1C5265;font-size:12px;font-weight:bold;line-height:18px;color:#67E8F9;">New</span></p>
    <table aria-label="Lead information" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">${rows}</table>
    <h2 style="margin:24px 0 12px;font-size:16px;line-height:24px;color:#F8FAFC;">Message</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#090D18"><tr><td style="padding:18px;border:1px solid #253047;font-size:14px;line-height:24px;word-break:break-word;color:#CBD5E1;">${escapeHtml(message).replace(/\r\n|\r|\n/g, "<br>")}</td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;line-height:20px;color:#94A3B8;">Reply to this email to respond directly to the customer.</p>`);
  const text = `New Lead Received

${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}

Message:
${message}

Reply to this email to respond directly to the customer.

StackNova Technologies`;
  return { subject, html, text };
}
