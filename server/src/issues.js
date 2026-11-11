// Known problems and problem reports, through the project's public GitHub
// issues. Upvotes are 👍 reactions on an issue. Nothing is ever posted from
// here: reports are a prefilled link the player opens and submits themselves.
import fs from "node:fs";
import path from "node:path";
import { REPO, VERSION } from "./version.js";

const API = "https://api.github.com";
const HOUR = 3600 * 1000;

async function gh(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "ForeverCompanion", Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  return res.json();
}

const shape = (i) => ({
  title: i.title,
  url: i.html_url,
  upvotes: i.reactions?.["+1"] ?? 0,
  known: (i.labels || []).some((l) => /known/i.test(l.name)),
  fix_coming: (i.labels || []).some((l) => /fix.?coming|in.?progress|planned/i.test(l.name)),
});

// Top open issues by 👍, cached for an hour.
export async function topIssues(dataDir, limit = 5) {
  const file = path.join(dataDir, "known-issues.json");
  try {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - c.at < HOUR) return c.items.slice(0, limit);
  } catch {}
  const d = await gh(`${API}/search/issues?q=${encodeURIComponent(`repo:${REPO} is:issue is:open`)}&sort=reactions-%2B1&order=desc&per_page=10`);
  const items = (d.items || []).map(shape);
  try {
    fs.writeFileSync(file, JSON.stringify({ at: Date.now(), items }));
  } catch {}
  return items.slice(0, limit);
}

// Open issues matching some words, best match first.
export async function searchIssues(query, limit = 5) {
  const words = String(query || "").replace(/[^\w\s'-]/g, " ").trim();
  const d = await gh(`${API}/search/issues?q=${encodeURIComponent(`repo:${REPO} is:issue is:open ${words}`)}&per_page=${limit}`);
  return (d.items || []).map(shape);
}

// A prefilled "new issue" link using the repository's issue form.
export function reportLink({ summary, what_happened, expected, diagnostics }) {
  const params = new URLSearchParams({
    template: "problem.yml",
    title: `[Problem] ${String(summary || "").slice(0, 90)}`,
    "what-happened": String(what_happened || "").slice(0, 1500),
    expected: String(expected || "").slice(0, 800),
    diagnostics: String(diagnostics || "").slice(0, 2500),
  });
  return `https://github.com/${REPO}/issues/new?${params}`;
}

// Version and game-support details for a report. No character name, realm,
// gold or other personal details: the issue will be public.
export function diagnostics(char, addonStatus) {
  const api = char?.api || {};
  const lines = [
    `Connector: ${VERSION}`,
    `Addon: ${char?.addonVersion || addonStatus?.installed || "unknown"}`,
    `Game client: ${api.clientVersion || "unknown"} (interface ${api.interface || "?"})`,
    `Platform: ${process.platform}`,
    `Character: level ${char?.level ?? "?"} ${char?.race || ""} ${char?.class || ""}`.trim(),
    `Snapshot: ${char?.reason || "?"}${char?.kept ? `, kept from earlier: ${[].concat(Object.values(char.kept)).join(", ")}` : ""}`,
    `Game functions: ${Object.entries(api)
      .filter(([k, v]) => typeof v === "string" && /present|missing/.test(v))
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  ];
  if (api.traits) lines.push(`Talents read: ${api.traits.named ?? "?"} named of ${api.traits.nodes ?? "?"} nodes`);
  return lines.join("\n");
}
