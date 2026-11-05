// The companion's own files: playstyle profile, hint-ladder progress and
// hand-written hints. Kept as plain JSON in the data folder so they're easy
// to read and edit by hand.
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROFILE } from "./defaults.js";

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  file(name) {
    return path.join(this.dir, name);
  }

  read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), "utf8"));
    } catch {
      return structuredClone(fallback);
    }
  }

  write(name, data) {
    const tmp = this.file(name + ".tmp");
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file(name));
  }

  profile() {
    if (!fs.existsSync(this.file("profile.json"))) this.write("profile.json", DEFAULT_PROFILE);
    return this.read("profile.json", DEFAULT_PROFILE);
  }

  saveProfile(p) {
    this.write("profile.json", p);
  }

  hintState() {
    return this.read("hint-progress.json", {});
  }

  saveHintState(s) {
    this.write("hint-progress.json", s);
  }

  ownHints() {
    return this.read("my-hints.json", {});
  }

  saveOwnHints(h) {
    this.write("my-hints.json", h);
  }
}

// Finds the profile entry for a character name ("Thrall", "Thrall Durotan").
export function characterProfile(profile, name) {
  if (!name) return null;
  const first = String(name).trim().split(/\s+/)[0].toLowerCase();
  for (const [key, value] of Object.entries(profile.characters || {})) {
    if (key.toLowerCase() === first || key.toLowerCase().split(/\s+/)[0] === first) return { key, ...value };
  }
  return null;
}
