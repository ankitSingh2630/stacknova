const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const compiled = (file) => ts.transpileModule(readFileSync(path.join(__dirname, file), "utf8"), { compilerOptions: options }).outputText;
const clientContext = { exports: {}, require: () => ({ appwriteConfig: { enquiryFunctionUrl: "" } }) };
vm.runInNewContext(compiled("../lib/enquiry.ts"), clientContext);
const validValues = { name: "Test Person", email: "test@example.com", phone: "+91 9876543210", company: "", service: "Web Development", message: "Build a website.", budget: "Not sure yet" };
function harness(submitEnquiry) {
  // Exercise the component's actual handlers with deterministic hook state and form data.
  // Browser verification separately checks DOM semantics, focus, labels, and field correction.
  const hooks = []; let cursor = 0;
  const slot = (initial) => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return index; };
  const react = {
    useRef: (value) => hooks[slot({ current: value })],
    useState: (value) => { const index = slot(value); return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; },
  };
  class Field { focus() { this.focused = true; } }
  const form = { values: { ...validValues }, resets: 0, elements: { namedItem: () => new Field() }, reset() { this.resets += 1; this.values = Object.fromEntries(Object.keys(this.values).map((key) => [key, ""])); } };
  const context = { exports: {}, FormData: class { constructor(form) { this.form = form; } get(key) { return this.form.values[key] ?? null; } },
    HTMLElement: Field, requestAnimationFrame: (callback) => callback(),
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "framer-motion") return { motion: { div: "div", form: "form" }, useReducedMotion: () => true };
      if (name === "@/lib/enquiry") return { ...clientContext.exports, submitEnquiry };
      throw new Error("Unexpected import");
    } };
  vm.runInNewContext(compiled("../components/Contact.tsx"), context);
  const render = () => { cursor = 0; return context.exports.default(); };
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
  };
  const getForm = () => find(render(), (node) => node.type === "form");
  const submit = () => getForm().props.onSubmit({ preventDefault() {}, currentTarget: form });
  return { form, render, find, getForm, submit };
}

test("fast repeated submits create one request; pending controls disable; success resets and feedback persists", async () => {
  let resolve; const response = new Promise((done) => { resolve = done; });
  let requests = 0; let received;
  const ui = harness(async (payload) => { requests += 1; received = payload; return response; });
  const pending = ui.submit();
  await ui.submit();
  assert.equal(requests, 1);
  assert.equal(received.message, "Build a website.\n\nBudget: Not sure yet");
  assert.equal(ui.getForm().props["aria-busy"], true);
  assert.equal(ui.find(ui.render(), (node) => node.type === "button").props.disabled, true);
  assert.equal(ui.find(ui.render(), (node) => node.type === "button").props.children, "Submitting…");
  resolve({ success: true, message: "Thank you! Your enquiry has been submitted successfully." });
  await pending;
  assert.equal(ui.form.resets, 1);
  assert.equal(ui.getForm().props["aria-busy"], false);
  assert.equal(ui.find(ui.render(), (node) => node.type === "button").props.disabled, false);
  assert.equal(ui.find(ui.render(), (node) => node.props?.role === "status").props.children, "Thank you! Your enquiry has been submitted successfully.");
  assert.equal(ui.find(ui.render(), (node) => node.type === "textarea").props.maxLength, 4000);
});

test("failure preserves entered values, restores controls, and allows retry", async () => {
  let requests = 0;
  const ui = harness(async () => { requests += 1; return { success: false, message: "Unable to submit your enquiry right now. Please try again later." }; });
  await ui.submit();
  assert.equal(ui.form.resets, 0);
  assert.deepEqual(ui.form.values, validValues);
  assert.equal(ui.getForm().props["aria-busy"], false);
  assert.equal(ui.find(ui.render(), (node) => node.type === "button").props.disabled, false);
  await ui.submit();
  assert.equal(requests, 2);
  assert.equal(ui.form.resets, 0);
});

test("budget alone cannot satisfy message validation and combined overflow never sends a request", async () => {
  let requests = 0;
  const ui = harness(async () => { requests += 1; return { success: true, message: "Saved" }; });
  ui.form.values.message = "   ";
  await ui.submit();
  assert.equal(requests, 0);
  assert.equal(ui.find(ui.render(), (node) => node.type === "textarea").props["aria-invalid"], true);
  ui.form.values.message = "m".repeat(4000);
  await ui.submit();
  assert.equal(requests, 0);
  assert.equal(ui.form.values.message.length, 4000);
});
