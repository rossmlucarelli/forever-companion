// Installs or updates the in-game addon from the copy bundled with the
// connector, so updating the connector keeps the addon in step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FLAVOURS = ["_forever_", "forever", "_classic_era_", "_classic_"];

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function bundledAddonDir() {
  for (const p of [path.join(HERE, "..", "addon", "ForeverCompanion"), path.join(HERE, "..", "..", "addon", "ForeverCompanion")])
    if (exists(path.join(p, "ForeverCompanion.toc"))) return p;
  return null;
}

export function findAddonsDir(wowDir) {
  if (!wowDir) return null;
  const base = path.resolve(wowDir);
  if (/^_?forever_?$/i.test(path.basename(base))) return path.join(base, "Interface", "AddOns");
  for (const f of FLAVOURS) {
    const dir = path.join(base, f);
    if (exists(dir)) return path.join(dir, "Interface", "AddOns");
  }
  return null;
}

export function tocVersion(dir) {
  try {
    return /##\s*Version:\s*([\d.]+)/.exec(fs.readFileSync(path.join(dir, "ForeverCompanion.toc"), "utf8"))?.[1] || null;
  } catch {
    return null;
  }
}

export function newer(a, b) {
  const pa = String(a || "0").split(".").map(Number);
  const pb = String(b || "0").split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// Copies the bundled addon in if it's missing or older. Never touches Plan.lua,
// which is written from the player's profile.
export function ensureAddon(wowDir) {
  const src = bundledAddonDir();
  const addons = findAddonsDir(wowDir);
  const status = { addon_folder: addons ? path.join(addons, "ForeverCompanion") : null, bundled: src ? tocVersion(src) : null };
  if (!src) return { ...status, action: "skipped", note: "No addon bundled with this connector." };
  if (!addons) return { ...status, action: "not found", note: `Couldn't find a Forever folder in ${wowDir}. Check the WoW folder setting.` };
  const dest = path.join(addons, "ForeverCompanion");
  const installed = tocVersion(dest);
  status.installed_before = installed;
  if (installed && !newer(status.bundled, installed)) return { ...status, action: "up to date", installed: installed };
  try {
    fs.mkdirSync(dest, { recursive: true });
    const newFiles = [];
    for (const f of fs.readdirSync(src)) {
      if (f === "Plan.lua" && exists(path.join(dest, f))) continue;
      if (!exists(path.join(dest, f))) newFiles.push(f);
      fs.copyFileSync(path.join(src, f), path.join(dest, f));
    }
    return {
      ...status,
      action: installed ? "updated" : "installed",
      installed: status.bundled,
      needs: newFiles.some((f) => /\.(toc|xml)$/i.test(f)) || !installed ? "a full game restart" : "/reload in game",
    };
  } catch (e) {
    return {
      ...status,
      action: "failed",
      error: e.code === "EPERM" || e.code === "EACCES" ? "Windows didn't allow writing to the WoW folder." : e.message,
      note: "Install the addon by hand this time: copy the ForeverCompanion folder from the release zip into the AddOns folder.",
    };
  }
}
