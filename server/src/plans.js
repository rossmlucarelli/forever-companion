// Talent plans: read an Icy Veins Forever calculator link into an ordered list
// of points, and write the addon's Plan.lua so /ding can show them in game.
import fs from "node:fs";
import path from "node:path";
import { TALENT_TREES } from "./talents.js";

const CLASSES = Object.keys(TALENT_TREES);

export function parseBuildLink(link, classHint) {
  const url = String(link || "").trim();
  const cls =
    (/\/(\w+)-talent-calculator/i.exec(url)?.[1] || String(classHint || "")).toLowerCase();
  if (!CLASSES.includes(cls)) throw new Error("Couldn't tell which class this link is for. Use a link from the Icy Veins WoW Forever talent calculator.");
  const code = /#tc-([0-9A-Za-z]+)/.exec(url)?.[1];
  if (!code) throw new Error("The link has no build in it (it should end in #tc-…). Copy the link after choosing the talents.");

  const byId = {};
  for (const tree of TALENT_TREES[cls]) for (const t of tree.talents) byId[t.id] = { ...t, tree: tree.name };
  const taken = {};
  const treePoints = {};
  const points = [];
  for (const ch of code) {
    const t = byId[ch];
    if (!t) throw new Error(`The link contains a talent code ("${ch}") this version doesn't know. The calculator may have changed since this release.`);
    taken[t.name] = (taken[t.name] || 0) + 1;
    if (taken[t.name] > t.max) throw new Error(`${t.name} appears more often than its ${t.max} ranks.`);
    if ((treePoints[t.tree] || 0) < t.req)
      throw new Error(`${t.name} needs ${t.req} points in ${t.tree} first, but the link takes it earlier. Check the order in the calculator.`);
    treePoints[t.tree] = (treePoints[t.tree] || 0) + 1;
    points.push({ level: 9 + points.length + 1, tree: t.tree, talent: t.name, rank: taken[t.name], of: t.max });
  }
  if (points.length > 51) throw new Error(`That's ${points.length} points; only 51 are available by level 60.`);
  return { class: cls, link: url, points, split: Object.entries(treePoints).map(([k, v]) => `${v} ${k}`).join(" / ") };
}

// Groups consecutive points into readable runs: "10–14 Power in Light 5/5".
export function planRuns(points) {
  const runs = [];
  for (const p of points) {
    const last = runs.at(-1);
    if (last && last.talent === p.talent) {
      last.to = p.level;
      last.rank = p.rank;
    } else runs.push({ from: p.level, to: p.level, talent: p.talent, tree: p.tree, rank: p.rank, of: p.of });
  }
  return runs.map((r) => `${r.from === r.to ? r.from : `${r.from}–${r.to}`}: ${r.talent} ${r.rank}/${r.of} (${r.tree})`);
}

const q = (s) => '"' + String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ") + '"';

export function planLua(profile) {
  let out = "-- Written by the Forever Companion connector from your profile. Changes here are overwritten.\nForeverCompanion_Plans = {\n";
  for (const [name, c] of Object.entries(profile.characters || {})) {
    const plan = c.plan;
    out += `  [${q(name)}] = {\n    name = ${q(plan ? `${name}'s build (${plan.split})` : name)},\n    points = {\n`;
    for (const p of plan?.points || [])
      out += `      { level = ${p.level}, tree = ${q(p.tree)}, talent = ${q(p.talent)}, rank = ${p.rank}, of = ${p.of}, why = ${q(plan.why?.[p.talent] || "")} },\n`;
    out += "    },\n    goals = {\n";
    for (const g of c.goals || [])
      if (!g.done && g.level)
        out += `      { name = ${q(g.name)}, level = ${g.level}, gold = ${g.cost_gold ?? "nil"}, riding = ${/riding/i.test(g.name)} },\n`;
    out += "    },\n  },\n";
  }
  return out + "}\n";
}

export function writePlanLua(addonDir, profile) {
  if (!addonDir) return false;
  const file = path.join(addonDir, "Plan.lua");
  const text = planLua(profile);
  try {
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return true;
    fs.writeFileSync(file, text);
    return true;
  } catch {
    return false;
  }
}
