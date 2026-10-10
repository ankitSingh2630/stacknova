const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { Query } = require("appwrite");
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const exports = {}; cache.set(path, exports);
  const context = { exports, require: name => {
    if (name === "appwrite") return { Query };
    if (name.endsWith("appwrite/config")) return { appwriteConfig: {} };
    const target = require("node:path").posix.normalize(require("node:path").posix.join(require("node:path").posix.dirname(path), name)) + ".ts";
    return load(target);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return exports;
}
module.exports = { types: load("lib/admin/types.ts"), api: load("lib/admin/leads.ts"), format: load("lib/admin/format.ts"),
  mutationApi: load("lib/admin/lead-mutations.ts"), queries: load("lib/admin/lead-queries.ts"), dashboardApi: load("lib/admin/dashboard.ts") };
