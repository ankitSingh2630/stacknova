const assert = require("node:assert/strict");
const { test } = require("node:test");
const { harness, lead, loaded, auth, deferred, tick, renderToStaticMarkup } = require("./helpers/admin-ui.cjs");
const { emailApi } = require("./helpers/admin.cjs");
function panel(options = {}, row = lead) {
  const ui = harness("components/admin/LeadEmailPanel.tsx", { leadsValue: loaded(), ...options });
  const render = () => ui.render({ lead: row });
  render(); ui.flush();
  const field = id => ui.find(render(), node => node.props.id === id);
  const fill = (subject = "Follow up", message = "Hello\nNext step") => {
    field("lead-email-subject").props.onChange({ target: { value: subject } });
    field("lead-email-message").props.onChange({ target: { value: message } });
  };
  const submit = () => ui.find(render(), node => node.type === "form").props.onSubmit({ preventDefault() {} });
  return { ui, render, field, fill, submit, button: () => ui.find(render(), node => node.type === "button"), setLead: value => { row = value; } };
}
test("active panel displays current lead recipient as text with four editable fields", () => {
  const state = panel(); const html = renderToStaticMarkup(state.render());
  assert.match(html, /Send Email/); assert.ok(html.includes(lead.email));
  assert.equal((html.match(/<(?:input|textarea)\b/g) || []).length, 4);
  assert.doesNotMatch(html, /value="customer@example.com"|name="(?:to|recipientEmail)"/);
  assert.equal(state.field("lead-email-subject").props.required, true);
  assert.equal(state.field("lead-email-subject").props.maxLength, 200);
  assert.equal(state.field("lead-email-message").props.maxLength, 10000);
});
test("Lead Details places email after Private Notes in the right column", () => {
  const ui = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: {
    ...loaded(), getLeadState: () => ({ status: "loaded", lead }), ensureLead: async () => {},
  } });
  const html = renderToStaticMarkup(ui.render());
  assert.ok(html.indexOf("Private Notes") < html.indexOf("Send Email"));
  assert.ok(html.includes(lead.email));
});
test("archived and unavailable leads do not expose send form", () => {
  assert.equal(panel({}, { ...lead, deletedAt: "2026-10-10T00:00:00.000Z" }).render(), null);
  const ui = harness("components/admin/LeadDetails.tsx", { id: lead.id, leadsValue: { ...loaded(), getLeadState: () => ({ status: "notFound" }) } });
  assert.doesNotMatch(renderToStaticMarkup(ui.render()), /Send Email/);
});
for (const [subject, message, expected] of [["", "Message", "subject"], ["   ", "Message", "subject"], ["Subject", "", "message"], ["Subject", " \n ", "message"]]) {
  test(`panel validates ${expected}: ${JSON.stringify([subject, message])}`, () => {
    let calls = 0; const state = panel({ emailSender: async () => { calls++; return { ok: true }; } });
    state.fill(subject, message); state.submit();
    assert.equal(calls, 0); assert.match(renderToStaticMarkup(state.render()), new RegExp(`Please enter a ${expected}`));
  });
}
test("duplicate submissions blocked synchronously; confirmed success clears both fields", async () => {
  const pending = deferred(), calls = [];
  const state = panel({ emailSender: (...args) => { calls.push(args); return pending.promise; } });
  state.fill();
  const form = state.ui.find(state.render(), node => node.type === "form");
  form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0], [lead.id, "Follow up", "Hello\nNext step", "", ""]);
  assert.equal(state.button().props.children, "Sending..."); assert.equal(state.button().props.disabled, true);
  assert.equal(state.field("lead-email-subject").props.disabled, true); assert.equal(state.field("lead-email-message").props.disabled, true);
  assert.equal(state.field("lead-email-subject").props.value, "Follow up");
  assert.doesNotMatch(renderToStaticMarkup(state.render()), /Email sent successfully/);
  pending.resolve({ ok: true }); await tick();
  assert.equal(state.field("lead-email-subject").props.value, ""); assert.equal(state.field("lead-email-message").props.value, "");
  assert.equal(state.button().props.children, "Sent"); assert.match(renderToStaticMarkup(state.render()), /Email sent successfully\./);
  state.fill(); assert.equal(state.button().props.children, "Send Email");
});
test("unconfirmed Function result preserves draft and hides raw provider error", async () => {
  let calls = 0;
  const execute = emailApi.createLeadEmailSender({ config: { sendLeadEmailFunctionId: "send-email" }, functions: {
    createExecution: async () => { calls++; return { status: "completed", responseStatusCode: 500, responseBody: '{"success":false,"message":"raw Resend error"}' }; },
  } });
  const state = panel({ emailSender: execute }); state.fill(); state.submit(); await tick();
  assert.equal(state.field("lead-email-subject").props.value, "Follow up"); assert.equal(state.field("lead-email-message").props.value, "Hello\nNext step");
  const html = renderToStaticMarkup(state.render()); assert.match(html, /Unable to send email right now/); assert.doesNotMatch(html, /raw Resend/);
  assert.equal(calls, 1); assert.equal(state.button().props.disabled, false);
  state.submit(); await tick(); assert.equal(calls, 2);
});
test("403 preserves signed-in session and drafts; no auth recheck", async () => {
  let checks = 0;
  const state = panel({ leadsValue: { ...loaded(), reportEmailSessionFailure: async () => { checks++; } },
    emailSender: async () => ({ ok: false, kind: "access", message: "raw permission details" }) });
  state.fill(); state.submit(); await tick();
  assert.equal(checks, 0); assert.equal(state.field("lead-email-subject").props.value, "Follow up");
  assert.match(renderToStaticMarkup(state.render()), /Unable to send email right now/);
});
test("401 routes to central cache-clearing/auth recheck exactly once without retry", async () => {
  let checks = 0, calls = 0;
  const state = panel({ leadsValue: { ...loaded(), reportEmailSessionFailure: async () => { checks++; } },
    emailSender: async () => { calls++; return { ok: false, kind: "session", message: "safe failure" }; } });
  state.fill(); state.submit(); await tick(); assert.equal(checks, 1); assert.equal(calls, 1);
  const store = harness("components/admin/LeadsProvider.tsx", { authValue: { ...auth, recheckSession: async () => { checks++; } },
    reader: { detail: async () => ({ ok: true, lead }) } });
  store.render(); store.flush(); await store.render().props.value.ensureLead(lead.id);
  assert.equal(store.render().props.value.getLeadState(lead.id).status, "loaded");
  await store.render().props.value.reportEmailSessionFailure();
  assert.equal(store.render().props.value.getLeadState(lead.id).status, "error");
  assert.equal(store.render().props.value.dashboard.summary, null);
  await store.render().props.value.reportEmailSessionFailure(); assert.equal(checks, 2);
});
for (const change of ["lead", "logout", "identity", "unmount", "archive"]) test(`stale response ignored after ${change}`, async () => {
  const pending = deferred(); let checks = 0;
  const state = panel({ emailSender: () => pending.promise, leadsValue: { ...loaded(), reportEmailSessionFailure: async () => { checks++; } } });
  state.fill(); state.submit();
  if (change === "lead") state.setLead({ ...lead, id: "different-lead", email: "different@example.com" });
  if (change === "archive") state.setLead({ ...lead, deletedAt: "2026-10-10T00:00:00.000Z" });
  if (change === "logout") state.ui.setAuth({ ...auth, state: { status: "signedOut" } });
  if (change === "identity") state.ui.setAuth({ ...auth, state: { status: "authorized", user: { $id: "other-admin" } } });
  if (change === "unmount") state.ui.unmount(); else { state.render(); state.ui.flush(); }
  pending.resolve({ ok: true }); await tick();
  assert.doesNotMatch(renderToStaticMarkup(state.render()), /Email sent successfully/); assert.equal(checks, 0);
});
test("pending lead mutation disables email sends", () => {
  let calls = 0; const state = panel({ leadsValue: { ...loaded(), getMutationState: () => ({ pending: true }) }, emailSender: async () => { calls++; } });
  state.fill(); state.submit(); assert.equal(calls, 0); assert.equal(state.button().props.disabled, true);
});

test("optional CC/BCC render between To and Subject with matching input styling", () => {
  const state = panel(); const html = renderToStaticMarkup(state.render());
  assert.ok(html.indexOf(lead.email) < html.indexOf("CC (optional)"));
  assert.ok(html.indexOf("CC (optional)") < html.indexOf("BCC (optional)"));
  assert.ok(html.indexOf("BCC (optional)") < html.indexOf("Subject"));
  for (const field of ["cc", "bcc"]) {
    const input = state.field(`lead-email-${field}`);
    assert.equal(input.props.required, undefined); assert.equal(input.props.className, state.field("lead-email-subject").props.className);
    assert.equal(input.props.type || "text", "text");
  }
});
for (const field of ["cc", "bcc"]) test(`invalid ${field} shows associated field-level feedback without sending`, () => {
  let calls = 0;
  const state = panel({emailSender: async () => { calls++; return {ok:true}; }}); state.fill();
  state.field(`lead-email-${field}`).props.onChange({target:{value:"bad-address"}}); state.submit();
  assert.equal(calls, 0); assert.equal(state.field(`lead-email-${field}`).props["aria-invalid"], true);
  assert.equal(state.field(`lead-email-${field}`).props["aria-describedby"], `lead-email-${field}-error`);
  assert.match(renderToStaticMarkup(state.render()), new RegExp(`Enter valid ${field.toUpperCase()} email addresses`));
  state.field(`lead-email-${field}`).props.onChange({target:{value:"fixed@example.com"}});
  assert.equal(state.field(`lead-email-${field}`).props["aria-invalid"], false);
});
for (const ok of [true, false]) test(`CC/BCC/subject/message ${ok ? "clear after confirmed success" : "are preserved on failure"}`, async () => {
  const pending = deferred(); let calls = 0;
  const state = panel({emailSender: async (...args) => { calls++; assert.deepEqual(args.slice(3), ["manager@example.com", "archive@example.com"]); return pending.promise; }});
  state.fill(); state.field("lead-email-cc").props.onChange({target:{value:"manager@example.com"}});
  state.field("lead-email-bcc").props.onChange({target:{value:"archive@example.com"}});
  const form = state.ui.find(state.render(), node=>node.type==="form"); form.props.onSubmit({preventDefault(){}}); form.props.onSubmit({preventDefault(){}});
  assert.equal(calls, 1);
  for (const field of ["cc", "bcc"]) { assert.equal(state.field(`lead-email-${field}`).props.disabled, true); assert.ok(state.field(`lead-email-${field}`).props.value); }
  pending.resolve(ok ? {ok:true} : {ok:false,kind:"failure",message:"raw Resend failure"}); await tick();
  for (const [field, value] of [["cc","manager@example.com"],["bcc","archive@example.com"],["subject","Follow up"],["message","Hello\nNext step"]])
    assert.equal(state.field(`lead-email-${field}`).props.value, ok ? "" : value);
  assert.ok(renderToStaticMarkup(state.render()).includes(lead.email));
  assert.doesNotMatch(renderToStaticMarkup(state.render()), /raw Resend failure/);
});
