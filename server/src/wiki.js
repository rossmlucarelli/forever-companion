// Looks things up on warcraft.wiki.gg (CC BY-SA community wiki) through its
// public MediaWiki API, politely: one request at a time, results cached.
import fs from "node:fs";
import path from "node:path";
import { ZONES } from "./defaults.js";

const isZone = (z) => !!z && ZONES.some((x) => x.toLowerCase() === String(z).toLowerCase());

const API = "https://warcraft.wiki.gg/api.php";
const UA = "ForeverCompanion/1.0 (personal Claude connector; low volume, cached)";
const WEEK = 7 * 24 * 3600 * 1000;

export class Wiki {
  constructor(dataDir) {
    this.cacheFile = path.join(dataDir, "wiki-cache.json");
    try {
      this.cache = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
    } catch {
      this.cache = {};
    }
  }

  async get(params) {
    const url = API + "?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
    const hit = this.cache[url];
    if (hit && Date.now() - hit.at < WEEK) return hit.data;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`wiki returned ${res.status}`);
    const data = await res.json();
    this.cache[url] = { at: Date.now(), data };
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache));
    } catch {}
    return data;
  }

  async search(term) {
    const d = await this.get({ action: "query", list: "search", srsearch: term, srlimit: "5" });
    return (d?.query?.search || []).map((r) => r.title);
  }

  async wikitext(title) {
    const d = await this.get({ action: "parse", page: title, prop: "wikitext", redirects: "1" });
    return { title: d?.parse?.title || title, text: d?.parse?.wikitext || "" };
  }

  // Finds the best page for a name and pulls out what the hint ladder needs.
  async lookup(name, kind) {
    // Search with "Forever" first so Forever-specific pages win when they exist.
    const foreverTitles = await this.search(`${name} Forever`).catch(() => []);
    const titles = [...new Set([...foreverTitles.filter((t) => t.toLowerCase().includes(name.toLowerCase())), ...(await this.search(name))])];
    if (!titles.length) return null;
    const lower = name.toLowerCase();
    const exact = titles.find((t) => t.toLowerCase() === lower);
    const pick =
      titles.find((t) => /forever/i.test(t) && t.toLowerCase().includes(lower)) ||
      exact ||
      titles.find((t) => t.toLowerCase().startsWith(lower)) ||
      titles.find((t) => (kind === "quest" ? /quest/i.test(t) : true)) ||
      titles[0];
    const page = await this.wikitext(pick);
    const facts = extractFacts(page.text);
    // If the "zone" is really an area (e.g. Goldshire), look that up once to
    // find the zone it sits in.
    if (facts.zone && !isZone(facts.zone)) {
      try {
        const parentTitles = await this.search(facts.zone);
        if (parentTitles.length) {
          const parent = extractFacts((await this.wikitext(parentTitles[0])).text);
          const area = facts.zone;
          if (isZone(parent.zone)) {
            facts.subzone = facts.subzone ? `${facts.subzone}, ${area}` : area;
            facts.zone = parent.zone;
          }
        }
      } catch {}
    }
    if (facts.zone && !isZone(facts.zone)) {
      facts.subzone = facts.subzone ? `${facts.subzone}, ${facts.zone}` : facts.zone;
      facts.zone = null;
    }
    facts.mentionsForever = /\bForever\b/.test(page.text);
    return { ...facts, title: page.title, url: `https://warcraft.wiki.gg/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` };
  }
}

// Removes wiki markup, leaving readable text.
export function plain(s) {
  if (!s) return "";
  return s
    .replace(/\{\{[Cc]oords?\|[^}]*\}\}/g, "")
    .replace(/\{\{\s*npc\s*\|([^}]*)\}\}/gi, (_, a) => npcTemplate(a).name || "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<([^<>]*[A-Za-z][^<>]*)>(?=\s*(,|$|<))/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function param(text, names) {
  for (const n of names) {
    const re = new RegExp(`\\|\\s*${n}\\s*=\\s*([^\\n]*)`, "i");
    const m = re.exec(text);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

export function parseCoords(s) {
  if (!s) return null;
  let m = /\{\{[Cc]oords?\|\s*([\d.]+)\s*\|\s*([\d.]+)(?:\|([^}|]*))?/.exec(s);
  if (m) return { x: Number(m[1]), y: Number(m[2]), zone: m[3] ? plain(m[3]) : null };
  m = /[\[(]\s*([\d.]+)\s*,\s*([\d.]+)\s*[\])]/.exec(s);
  if (m) return { x: Number(m[1]), y: Number(m[2]), zone: null };
  return null;
}

export function extractFacts(text) {
  const locRaw = param(text, ["location", "loc"]);
  const coordsRaw = param(text, ["coords", "coordinates"]);
  const zoneRaw = param(text, ["zone", "area"]);
  const coords = parseCoords(coordsRaw) || parseCoords(locRaw) || parseCoords(text.slice(0, 4000));
  let zone = plain(zoneRaw) || null;
  const stripCoords = (v) => (v || "").replace(/[\[(]\s*[\d.]+\s*,\s*[\d.]+\s*[\])]/g, "");
  let place = plain(stripCoords(locRaw)) || null;
  if (place && /^(various|unknown|multiple|see below)$/i.test(place)) place = null;
  // "Goldshire, Elwynn Forest" → subzone Goldshire, zone Elwynn Forest
  let subzone = null;
  if (place && place.includes(",")) {
    const parts = place.split(",").map((p) => p.trim()).filter(Boolean);
    if (!zone) zone = parts[parts.length - 1];
    subzone = parts.slice(0, -1).join(", ");
  } else if (place && !zone) zone = place;
  else if (place && zone && place !== zone) subzone = place;
  if (!zone && coords?.zone) zone = coords.zone;

  // Fallback: pages for characters found in several places say "Various" in
  // the infobox and list places in a Locations section or the first paragraph.
  let found = null;
  if (!zone || !isZone(zone)) found = locationFromBody(text);
  if (found) {
    zone = found.zone;
    subzone = found.subzone || subzone;
  }
  const finalCoords = coords || found?.coords || null;

  return {
    zone,
    subzone,
    coords: finalCoords ? { x: finalCoords.x, y: finalCoords.y } : null,
    role: plain(param(text, ["title", "role", "occupation"])) || null,
    creatureType: plain(param(text, ["type", "creature"])) || null,
    affiliation: plain(param(text, ["affiliation", "faction"])) || null,
    questStart: plain(param(text, ["start", "starts", "begins"])) || null,
    questEnd: plain(param(text, ["end", "ends", "finish"])) || null,
    level: plain(param(text, ["level"])) || null,
    vendors: vendorsFrom(text),
  };
}

// {{npc|faction|Name|Title}} or {{npc||Name|Title}} → { name, title }
export function npcTemplate(args) {
  const parts = String(args).split("|").map((p) => p.trim());
  const named = parts.filter((p) => p && !/=/.test(p));
  const looksFaction = (p) => /^(a|h|alliance|horde|n|neutral|combat|mixed)$/i.test(p);
  let rest = parts;
  if (parts.length > 1 && (parts[0] === "" || looksFaction(parts[0]))) rest = parts.slice(1);
  const name = (rest[0] || named[0] || "").replace(/^\[\[|\]\]$/g, "");
  return { name: name || null, title: rest[1] || null };
}

// Who sells an item: the list after "purchased"/"sold by"/"bought" on item pages.
export function vendorsFrom(text) {
  const m = /(purchased|sold by|bought|available from|sells? it)[^\n]*\n?((?:[ \t]*\*[^\n]*\n?)+)?/i.exec(text);
  if (!m) return [];
  const lines = (m[2] || m[0]).split("\n").filter((l) => /\{\{\s*npc|\[\[/i.test(l));
  const out = [];
  for (const line of lines) {
    let name = null;
    let title = null;
    const t = /\{\{\s*npc\s*\|([^}]*)\}\}/i.exec(line);
    if (t) ({ name, title } = npcTemplate(t[1]));
    else {
      const links = [...line.matchAll(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g)].map((x) => x[1]);
      name = links.find((l) => !isZone(l)) || null;
      title = /<([^<>]+)>|&lt;(.+?)&gt;/.exec(line)?.slice(1).find(Boolean) || null;
    }
    const zone = [...line.matchAll(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g)].map((x) => x[1]).find((l) => isZone(l)) || null;
    if (name) out.push({ name, title, zone });
  }
  return out.slice(0, 8);
}

// Finds the first Classic or Forever zone named in a Locations section (or,
// failing that, the opening paragraph), plus the area and coordinates beside it.
export function locationFromBody(text) {
  const links = (line) => [...line.matchAll(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g)].map((m) => m[1].trim());
  const section = /==+\s*Locations?\s*==+([\s\S]*?)(?:\n==[^=]|$)/i.exec(text);
  const scan = (body, withCoords) => {
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const names = links(lines[i]);
      const z = names.find((n) => isZone(n));
      if (!z) continue;
      const others = names.filter((n) => n !== z && !isZone(n) && !/[:]/.test(n) && /^[A-Z]/.test(n));
      let c = null;
      if (withCoords) for (let j = i; j < Math.min(i + 4, lines.length) && !c; j++) c = parseCoords(lines[j]);
      return { zone: z, subzone: others.length ? others.join(", ") : null, coords: c ? { x: c.x, y: c.y } : null };
    }
    return null;
  };
  if (section) {
    const hit = scan(section[1], true);
    if (hit) return hit;
  }
  // Opening paragraph: first prose line after the infobox.
  const lead = text.replace(/\{\{[\s\S]*?\n\}\}/, "").split("\n").find((l) => /\[\[/.test(l) && !/^[{|!]/.test(l.trim()));
  return lead ? scan(lead, false) : null;
}
