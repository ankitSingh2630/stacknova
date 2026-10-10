const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const { harness, loaded, lead, auth, renderToStaticMarkup } = require("./helpers/admin-ui.cjs");
const find = (ui, predicate) => ui.find(ui.render(), predicate);
const nav = () => harness("components/admin/AdminNavbar.tsx", { authValue: { ...auth, logout: async () => {}, loggingOut: false, logoutError: "" } });

test("admin header uses the existing public logo and Dashboard/Leads/Logout with identity", () => {
  const ui = nav(); const html = renderToStaticMarkup(ui.render());
  assert.match(html, /src="\/logo.png"/); assert.match(html, /alt="StackNova Technologies logo"/);
  assert.match(html, /h-14 w-auto sm:h-22/); assert.match(html, /Dashboard/); assert.match(html, /Leads/); assert.match(html, /Logout/);
  assert.match(html, /Signed in as/); assert.doesNotMatch(html, /Admin quick navigation|bottomNav|#about|#services|#contact/);
});
test("one mobile header menu supports toggling, Escape, outside click and route closure", () => {
  const ui = nav(); ui.render(); ui.flush();
  const toggle = () => find(ui, node => node.type === "button" && node.props["aria-controls"] === "admin-mobile-menu");
  const menu = () => find(ui, node => node.props.id === "admin-mobile-menu");
  assert.equal(toggle().props["aria-expanded"], false); assert.equal(menu(), undefined);
  toggle().props.onClick(); ui.render(); ui.flush(); assert.equal(toggle().props["aria-expanded"], true);
  assert.match(renderToStaticMarkup(menu()), /Dashboard/); assert.match(renderToStaticMarkup(menu()), /Leads/); assert.match(renderToStaticMarkup(menu()), /Logout/);
  let focused = 0; toggle().ref.current = { focus: () => { focused++; }, contains: () => false }; menu().ref.current = { contains: () => false };
  ui.listeners.get("keydown")({ key: "Escape" }); ui.render(); ui.flush(); assert.equal(menu(), undefined); assert.equal(focused, 1);
  toggle().props.onClick(); ui.render(); ui.flush(); ui.listeners.get("pointerdown")({ target: {} }); ui.render(); ui.flush(); assert.equal(menu(), undefined);
  toggle().props.onClick(); ui.render(); ui.flush(); ui.setPathname("/admin/leads/"); ui.render(); ui.flush(); assert.equal(menu(), undefined);
  const link = find(ui, node => node.props.href === "/admin/leads/"); assert.equal(link.props["aria-current"], "page");
});
test("dashboard renders five real recent leads alongside all normal statistics", () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ ...lead, id: `recent-${index}`, name: `Customer ${index}` }));
  const value = loaded(rows, 42);
  const html = renderToStaticMarkup(harness("components/admin/Dashboard.tsx", { leadsValue: value }).render());
  for (const row of rows) assert.ok(html.includes(row.name));
  for (const status of ["Total", "New", "Contacted", "In Progress", "Converted", "Closed"]) assert.ok(html.includes(status));
  assert.doesNotMatch(html, /Open Pipeline|Review|Recent Open Leads/);
});
test("admin visuals reference the public theme/classes and inherit Manrope without separate fonts", () => {
  const css = fs.readFileSync("app/admin/admin.module.css", "utf8");
  for (const token of ["colors.navy.950", "colors.ink", "colors.muted", "colors.line", "colors.accent.blue", "colors.accent.cyan", "maxWidth.7xl"]) assert.ok(css.includes(token), token);
  for (const globalClass of ["btn-primary", "btn-ghost", "field"]) assert.match(css, new RegExp(`composes: ${globalClass} from global`));
  assert.doesNotMatch(css, /Georgia|admin-heading-font|admin-body-font|bottomNav/);
  assert.doesNotMatch(fs.readFileSync("app/admin/layout.tsx", "utf8"), /next\/font|Inter|Jakarta/);
  assert.match(css, /height: 80px/); assert.match(css, /min-width: 1024px/); assert.match(css, /max-width: 767px/);
  assert.match(fs.readFileSync("lib/admin/lead-queries.ts", "utf8"), /LEADS_PAGE_SIZE = 5/);
});
test("login uses the deployed StackNova logo, labelled controls and the public primary button", () => {
  const source = fs.readFileSync("components/admin/LoginForm.tsx", "utf8");
  assert.match(source, /src="\/logo.png"/); assert.match(source, /htmlFor="admin-email"/); assert.match(source, /htmlFor="admin-password"/);
  assert.match(source, /styles.primaryButton/); assert.doesNotMatch(source, /Ops Core|Lead Ops|brandMark/);
});
