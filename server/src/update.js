// Checks GitHub once a day for a newer release. It only tells the player;
// installing stays a deliberate double-click through Claude.
import fs from "node:fs";
import path from "node:path";
import { VERSION, REPO } from "./version.js";
import { newer } from "./install.js";

const DAY = 24 * 3600 * 1000;

export async function checkForUpdate(dataDir) {
  const file = path.join(dataDir, "update-check.json");
  let cache = null;
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  if (!cache || Date.now() - cache.at > DAY) {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { "User-Agent": "ForeverCompanion", Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = await res.json();
      const asset = (r.assets || []).find((a) => a.name.endsWith(".mcpb"));
      cache = { at: Date.now(), latest: String(r.tag_name || "").replace(/^v/, ""), page: r.html_url, download: asset?.browser_download_url || null, notes: (r.body || "").slice(0, 600) };
      fs.writeFileSync(file, JSON.stringify(cache));
    } catch (e) {
      return { checked: false, current: VERSION, note: `Couldn't check for updates (${e.message}).` };
    }
  }
  const available = newer(cache.latest, VERSION);
  return { checked: true, current: VERSION, latest: cache.latest || VERSION, update_available: available, ...(available ? { page: cache.page, download: cache.download, whats_new: cache.notes } : {}) };
}
