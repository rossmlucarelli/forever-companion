// Finds the companion addon's SavedVariables file(s) and loads the snapshots.
import fs from "node:fs";
import path from "node:path";
import { parseSavedVariables } from "./lua.js";

const FLAVOURS = ["_forever_", "forever", "_classic_beta_", "_classic_era_", "_classic_", "_retail_"];

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function listDirs(p) {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(p, d.name));
  } catch {
    return [];
  }
}

// Accepts the main "World of Warcraft" folder, a flavour folder such as
// "_forever_", or its WTF folder.
export function findSavedVariableFiles(wowDir) {
  if (!wowDir) return [];
  const roots = [];
  const base = path.resolve(wowDir);
  if (path.basename(base).toUpperCase() === "WTF") roots.push(base);
  else {
    if (exists(path.join(base, "WTF"))) roots.push(path.join(base, "WTF"));
    for (const f of FLAVOURS) {
      const wtf = path.join(base, f, "WTF");
      if (exists(wtf)) roots.push(wtf);
    }
  }
  const files = [];
  for (const wtf of roots) {
    for (const account of listDirs(path.join(wtf, "Account"))) {
      const file = path.join(account, "SavedVariables", "ForeverCompanion.lua");
      if (exists(file)) files.push(file);
    }
  }
  return files;
}

export function loadCharacters(wowDir) {
  const files = findSavedVariableFiles(wowDir);
  const chars = {};
  const problems = [];
  for (const file of files) {
    let db;
    try {
      db = parseSavedVariables(fs.readFileSync(file, "utf8")).ForeverCompanionDB;
    } catch (e) {
      problems.push(`${file}: ${e.message}`);
      continue;
    }
    if (!db || typeof db !== "object") continue;
    const characters = db.characters && typeof db.characters === "object" ? db.characters : {};
    const visited = db.visited && typeof db.visited === "object" ? db.visited : {};
    for (const [key, snap] of Object.entries(characters)) {
      if (!snap || typeof snap !== "object") continue;
      const v = visited[key] || {};
      snap.key = key;
      snap.file = file;
      snap.visitedZones = Object.keys(v.zones && !Array.isArray(v.zones) ? v.zones : {});
      snap.visitedSubzones = Object.keys(v.subzones && !Array.isArray(v.subzones) ? v.subzones : {});
      const prev = chars[key];
      if (!prev || (snap.savedAt || 0) > (prev.savedAt || 0)) chars[key] = snap;
    }
  }
  return { characters: Object.values(chars), files, problems };
}

export function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
}

export function pickCharacter(characters, name) {
  if (!characters.length) return null;
  if (name) {
    const first = String(name).trim().split(/\s+/)[0].toLowerCase();
    const hit = characters.find(
      (c) => (c.name || "").toLowerCase() === first || (c.key || "").toLowerCase().startsWith(first + "-")
    );
    if (hit) return hit;
    return null;
  }
  // Default: whichever character was saved most recently.
  return [...characters].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
}

export function snapshotAge(savedAt) {
  if (!savedAt) return "unknown";
  const mins = Math.round((Date.now() / 1000 - savedAt) / 60);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

export function gold(copper) {
  const c = Number(copper) || 0;
  return Math.floor(c / 10000) + Math.floor((c % 10000) / 100) / 100;
}

export function formatMoney(copper) {
  const c = Math.max(0, Math.round(Number(copper) || 0));
  const g = Math.floor(c / 10000);
  const s = Math.floor((c % 10000) / 100);
  const b = c % 100;
  return [g && `${g}g`, s && `${s}s`, (b || (!g && !s)) && `${b}c`].filter(Boolean).join(" ");
}
