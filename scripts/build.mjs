// Builds the connector (.mcpb, with the addon inside) and a separate addon zip.
// Usage: node scripts/build.mjs   (from the repository root)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { VERSION } from "../server/src/version.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const r = (...p) => path.join(root, ...p);
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

// 1. One version everywhere.
const toc = r("addon", "ForeverCompanion", "ForeverCompanion.toc");
fs.writeFileSync(toc, fs.readFileSync(toc, "utf8").replace(/## Version: .*/, `## Version: ${VERSION}`));
const lua = r("addon", "ForeverCompanion", "ForeverCompanion.lua");
fs.writeFileSync(lua, fs.readFileSync(lua, "utf8").replace(/local VERSION = ".*?"/, `local VERSION = "${VERSION}"`));
const manifest = JSON.parse(fs.readFileSync(r("mcpb", "manifest.json"), "utf8"));
manifest.version = VERSION;
fs.writeFileSync(r("mcpb", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// 2. Stage the extension.
const pkg = r("build", "pkg");
fs.rmSync(r("build"), { recursive: true, force: true });
fs.mkdirSync(path.join(pkg, "server"), { recursive: true });
run(
  `npx esbuild src/index.js --bundle --platform=node --format=esm --target=node18 --outfile=${JSON.stringify(path.join(pkg, "server", "index.js"))} --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"`,
  r("server")
);
fs.writeFileSync(path.join(pkg, "server", "package.json"), '{"type":"module"}\n');
fs.cpSync(r("addon"), path.join(pkg, "addon"), { recursive: true });
for (const f of ["manifest.json"]) fs.copyFileSync(r("mcpb", f), path.join(pkg, f));
for (const f of ["README.md", "LICENSE"]) if (fs.existsSync(r(f))) fs.copyFileSync(r(f), path.join(pkg, f));

// 3. Package.
fs.mkdirSync(r("dist"), { recursive: true });
run(`npx -y @anthropic-ai/mcpb@2.1.2 pack ${JSON.stringify(pkg)} ${JSON.stringify(r("dist", "forever-companion.mcpb"))}`);
try {
  fs.rmSync(r("dist", "ForeverCompanion-addon.zip"), { force: true });
  run(`zip -rq ${JSON.stringify(r("dist", "ForeverCompanion-addon.zip"))} ForeverCompanion`, r("addon"));
} catch {
  console.log("zip not available: skipped the separate addon zip (the .mcpb already contains the addon).");
}
console.log(`Built Forever Companion ${VERSION} in dist/`);
