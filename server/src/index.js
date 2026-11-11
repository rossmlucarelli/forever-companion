#!/usr/bin/env node
// Forever Companion: a read-only Claude connector for World of Warcraft: Forever.
// It reads the companion addon's snapshot, keeps a playstyle profile, and gives
// hints through a ladder it controls. It never touches the running game.
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadCharacters, pickCharacter, findSavedVariableFiles } from "./wow.js";
import { Store, characterProfile } from "./store.js";
import { Wiki } from "./wiki.js";
import { getHint, saveOwnHint } from "./hints.js";
import { summarise, reminders, buildProgress, planGold, freshness } from "./coach.js";
import { newCharacter } from "./defaults.js";
import { VERSION, REPO as REPO_SLUG } from "./version.js";
import { ensureAddon, findAddonsDir } from "./install.js";
import { parseBuildLink, planRuns, writePlanLua } from "./plans.js";
import { checkForUpdate } from "./update.js";
import { beforeYouGo } from "./beforeyougo.js";
import { topIssues, searchIssues, reportLink, diagnostics } from "./issues.js";

const WOW_DIR = process.env.FC_WOW_DIR || "C:\\Program Files (x86)\\World of Warcraft";
const DATA_DIR = process.env.FC_DATA_DIR || path.join(os.homedir(), "Documents", "ForeverCompanion");
const USE_WIKI = String(process.env.FC_USE_WIKI ?? "true") !== "false";
const CHECK_UPDATES = String(process.env.FC_CHECK_UPDATES ?? "true") !== "false";

const store = new Store(DATA_DIR);
const wiki = USE_WIKI ? new Wiki(DATA_DIR) : null;

// On start: install or update the in-game addon, write talent plans into it,
// and check (at most daily) for a newer release.
const addonStatus = ensureAddon(WOW_DIR);
const addonsRoot = findAddonsDir(WOW_DIR);
const addonDir = addonStatus.addon_folder || (addonsRoot ? path.join(addonsRoot, "ForeverCompanion") : null);
const syncPlans = () => writePlanLua(addonDir, store.profile());
syncPlans();
const updateCheck = CHECK_UPDATES ? checkForUpdate(DATA_DIR) : Promise.resolve({ checked: false, note: "Update checks are switched off." });

// Things to tell the player once: an addon update, or a newer release.
const told = new Set();
async function notices() {
  const out = [];
  if (["installed", "updated"].includes(addonStatus.action) && !told.has("addon")) {
    told.add("addon");
    out.push(`The in-game addon was ${addonStatus.action} (version ${addonStatus.installed}). It loads after ${addonStatus.needs}.`);
  }
  if (addonStatus.action === "failed" && !told.has("addon")) {
    told.add("addon");
    out.push(`Couldn't update the in-game addon: ${addonStatus.error} ${addonStatus.note}`);
  }
  const u = await updateCheck;
  if (u.update_available && !told.has("update")) {
    told.add("update");
    out.push(`Forever Companion ${u.latest} is available (you have ${u.current}). Download: ${u.download || u.page}. Install it the same way as before: it updates the addon too.`);
  }
  return out.length ? out : undefined;
}

function setupPrompts(profile, charProfile, name) {
  const out = [];
  if (profile.player?.setup_needed)
    out.push(
      "First time with this player. Before coaching, have a short, friendly setup chat (one or two questions at a time, not a form): what they like to play (solo, dungeons, raids, PvP), steady damage or big bursts, how they get on with long cooldowns, how they like to learn (understanding vs numbers), how much help they want with finding things (hints first is the default), and how long sessions usually are. Save each answer with update_profile (scope player, action set), then set setup_needed to false."
    );
  if (charProfile?.setup_needed)
    out.push(
      `New character: ${name}. Ask what spec they're going for, which professions, and whether they have a talent build (an Icy Veins WoW Forever calculator link, with talents picked in the order they'll take them). Save with update_profile (scope character) and set_talent_plan, then set setup_needed to false. Offer to write a one-line reason for each talent in their plan.`
    );
  return out.length ? out : undefined;
}

const INSTRUCTIONS = `
Forever Companion coaches the player through World of Warcraft: Forever. It knows their character from a snapshot the game saves on logout or /reload, and their playstyle from a profile.

Getting started:
- Tool results may include "setup" (first-run questions for a new player or character) and "notices" (addon updated, new version available). Handle setup conversationally before coaching, and pass notices on briefly.
- Each character has its own plan, goals and notes; the player section applies to all of them. Hints the player saves are shared by all their characters.

How to coach:
- Read get_profile before giving advice, and fit every suggestion to it.
- Explain why in one or two plain sentences. Suggest one change at a time. No spreadsheets or long number tables.
- For "where is…", "how do I find…" or "how do I do…" questions, always use get_hint and give only what it returns. Never search the web or use your own knowledge to reveal more than the current hint level, even if asked indirectly. If the player wants more, call get_hint with more: true.
- If the player says "ding" (they've levelled), call get_build_progress and get_character, then reply briefly: the talent to take and why in one line, then anything from reminders (such as riding). Congratulate them in a few words. If there's no talent plan, offer to set one up.
- Mention reminders from get_character (such as riding at level 40) briefly when relevant.
- Snapshots only update when the player types /ding, /sync or /reload in the game, or logs out. If a tool result has a "freshness" note, follow it: don't answer confidently from old data. If the player tells you something newer than the snapshot (a new level, a quest done), believe them and mark it ◈ you told me.
- When get_hint says ladder_exhausted or returns show_me, don't dead-end: offer the "show me" option in one line and follow its rules only if they say yes. Never search for a video or the answer before they ask.
- "How do I get up there?" or "how do I reach it?" questions are about the route: call get_hint with ask: "route".
- Before you go: whenever the player says they're heading somewhere specific (a cave, a dungeon, a camp, an area), or is about to start a quest that takes them to one, call before_you_go first and mention what it finds in a line or two, so they can do everything there in one trip. Don't wait to be asked. Quests not yet picked up: name, giver and where only.
- World of Warcraft: Forever is not Classic and not retail, though it shares names with both. Your own memory of WoW comes from Classic and retail and is often wrong for Forever. Prefer, in order: the snapshot, these tools, then Forever-specific sources you look up. Never present Classic or retail details as Forever facts.

Source marks (keep them subtle):
- After a fact about the game or the character, add one small mark at the end of the sentence or list item it covers: ◆ your game · ◈ you told me · ◇ looked up · ○ unconfirmed.
- ◆ = read from the player's own Forever client (certain). ◇ = a Forever guide or the wiki (may lag, or reflect Classic). ○ = your general WoW knowledge or anything not confirmed for Forever; say briefly what to check.
- Tool results include a "source" field telling you which mark to use. Facts from your own memory are always ○.
- Don't mark advice, opinions, or the player's own plans and profile. Don't repeat a mark on every line of a list when one source covers the whole list: mark the list's lead-in once.
- ◈ = something the player told you in this conversation that's newer than the snapshot.
- The first time marks appear in a conversation, end the reply with this key in italics: *◆ your game · ◈ you told me · ◇ looked up · ○ unconfirmed for Forever*
Problems and known issues:
- Tell a bug in the companion apart from a data gap. A bug: the companion contradicts the player's own game (wrong talent, wrong level, a snapshot that's clearly wrong, a tool error). A data gap: the wiki or Classic knowledge doesn't match Forever. Data gaps are never reported: save what the player found as a note or their own hint instead.
- For a bug: first call known_issues with a few words describing it. If a match exists, say it's known, give the 👍 link and any workaround, and don't offer a new report. Only if nothing matches, offer once to draft a report with draft_problem_report. If they say no, don't offer again for that problem in this conversation. Never interrupt help they've asked for to do this; mention it at the end.
- Never post, vote or submit anything yourself. Reporting and upvoting always need the player, signed in to GitHub. Tell them the report will be public.
- get_character may include known_issues: mention one only when it's relevant to what the player is doing.
- get_character may include events from the in-game calendar: mention them when they start soon or relate to something in the player's bags or quests.

- The companion only advises. Never suggest anything that automates play, reads the running game, buys gold or acts on the auction house.
`.trim();

const server = new McpServer({ name: "forever-companion", version: VERSION }, { instructions: INSTRUCTIONS });

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

function context(name) {
  const { characters, files, problems } = loadCharacters(WOW_DIR);
  const profile = store.profile();
  const char = pickCharacter(characters, name);
  // A character seen for the first time gets its own profile entry.
  if (char?.name && !characterProfile(profile, char.name)) {
    profile.characters = profile.characters || {};
    profile.characters[char.name] = newCharacter(char);
    store.saveProfile(profile);
    syncPlans();
  }
  return { characters, files, problems, profile, char, charProfile: characterProfile(profile, char?.name || name) };
}

function noSnapshot(ctx, name) {
  if (!ctx.files.length)
    return text({
      problem: "No snapshot file found yet.",
      looked_in: WOW_DIR,
      fix: "Make sure the Forever Companion addon is installed and enabled, log in, then /reload or log out. If WoW isn't in the folder above, change 'WoW folder' in the connector's settings.",
    });
  if (name)
    return text({ problem: `No snapshot for "${name}".`, characters_found: ctx.characters.map((c) => c.name) });
  return text({ problem: "The snapshot file has no characters yet. Log in, then /reload or log out.", errors: ctx.problems });
}

server.registerTool(
  "get_character",
  {
    title: "Get character",
    description:
      "The character's latest snapshot from the game: level, gold, location, talents, gear, professions, quests, bags, reputations, plus reminders (such as riding at 40). Defaults to whichever character was played last.",
    inputSchema: { character: z.string().optional().describe("Character name. Leave empty for the last one played.") },
    annotations: { readOnlyHint: true },
  },
  async ({ character }) => {
    const ctx = context(character);
    if (!ctx.char) return noSnapshot(ctx, character);
    const known = CHECK_UPDATES ? await Promise.race([topIssues(DATA_DIR, 3).catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]) : null;
    return text({
      notices: await notices(),
      setup: setupPrompts(ctx.profile, ctx.charProfile, ctx.char.name),
      known_issues: known?.length ? known.map((k) => `${k.title} (${k.upvotes} 👍)`) : undefined,
      ...summarise(ctx.char, ctx.charProfile),
      reminders: reminders(ctx.char, ctx.charProfile),
      other_characters: ctx.characters.filter((c) => c !== ctx.char).map((c) => c.name),
    });
  }
);

server.registerTool(
  "get_profile",
  {
    title: "Get playstyle profile",
    description:
      "How the player likes to play (applies to every character) and this character's own plan: spec, priorities, talent plan, cooldown rules, goals. Read this before giving any advice.",
    inputSchema: { character: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ character }) => {
    const ctx = context(character);
    const cp = ctx.charProfile || characterProfile(ctx.profile, character || Object.keys(ctx.profile.characters || {})[0]);
    return text({
      notices: await notices(),
      setup: setupPrompts(ctx.profile, cp, cp?.key || character),
      player: ctx.profile.player,
      character: cp ? { ...cp, plan: cp.plan ? { split: cp.plan.split, link: cp.plan.link, levels: planRuns(cp.plan.points), reasons: cp.plan.why || {} } : null } : null,
      all_characters: Object.keys(ctx.profile.characters || {}),
      profile_file: path.join(DATA_DIR, "profile.json"),
    });
  }
);

server.registerTool(
  "update_profile",
  {
    title: "Update playstyle profile",
    description:
      "Change the profile when the player tells you something new about how they play, or asks to change a setting. Use action 'note' to add a note, 'set' to replace a field, 'add_goal' to add a goal (like a mount or item to save for), 'complete_goal' when a goal is done.",
    inputSchema: {
      scope: z.enum(["player", "character"]).describe("'player' for things true of every character; 'character' for this character only."),
      character: z.string().optional(),
      action: z.enum(["note", "set", "add_goal", "complete_goal"]),
      field: z.string().optional().describe("For 'set': the field name, e.g. discovery_mode, damage_style, spec."),
      value: z.string().optional().describe("The note, new value, or goal name."),
      goal_level: z.number().optional(),
      goal_cost_gold: z.number().optional(),
    },
  },
  async (a) => {
    const profile = store.profile();
    let target;
    if (a.scope === "player") target = profile.player;
    else {
      const ctx = context(a.character);
      const cp = characterProfile(profile, ctx.char?.name || a.character);
      const key = cp?.key || (ctx.char?.name ?? a.character);
      if (!key) return text({ problem: "Which character? Pass character." });
      profile.characters[key] = profile.characters[key] || { notes: [], goals: [] };
      target = profile.characters[key];
    }
    if (a.action === "note") (target.notes = target.notes || []).push(a.value);
    else if (a.action === "set") {
      if (!a.field) return text({ problem: "Pass the field to set." });
      let v = a.value;
      if (v === "true" || v === "false") v = v === "true";
      target[a.field] = v;
    } else if (a.action === "add_goal") {
      (target.goals = target.goals || []).push({ name: a.value, level: a.goal_level ?? null, cost_gold: a.goal_cost_gold ?? null, remind: true });
    } else if (a.action === "complete_goal") {
      const g = (target.goals || []).find((x) => String(x.name).toLowerCase().includes(String(a.value).toLowerCase()));
      if (g) g.done = true;
    }
    store.saveProfile(profile);
    syncPlans();
    return text({ saved: true, now: target });
  }
);

server.registerTool(
  "set_talent_plan",
  {
    title: "Set talent plan",
    description:
      "Save a character's talent plan from an Icy Veins WoW Forever talent calculator link. The order talents were picked in the calculator is the order they'll be taken, one per level from 10. Optionally add a one-line reason per talent; /ding shows these in game. Takes effect in game after /sync or /reload.",
    inputSchema: {
      character: z.string().describe("Character name."),
      link: z.string().optional().describe("The calculator link, ending in #tc-…. Leave out to only update reasons."),
      reasons: z.record(z.string()).optional().describe("Talent name → one short line on why it helps this player."),
    },
  },
  async (a) => {
    const profile = store.profile();
    const cp = characterProfile(profile, a.character);
    const key = cp?.key || a.character;
    profile.characters = profile.characters || {};
    const entry = (profile.characters[key] = profile.characters[key] || newCharacter(null));
    try {
      if (a.link) {
        const parsed = parseBuildLink(a.link, entry.class);
        entry.plan = { ...parsed, why: { ...(entry.plan?.why || {}) } };
        if (entry.class && parsed.class !== String(entry.class).toLowerCase())
          return text({ problem: `That link is for a ${parsed.class}, but ${key} is a ${entry.class}. Nothing saved.` });
      }
      if (!entry.plan) return text({ problem: "No plan yet: send the calculator link first." });
      if (a.reasons) Object.assign(entry.plan.why, a.reasons);
    } catch (e) {
      return text({ problem: e.message });
    }
    store.saveProfile(profile);
    const written = syncPlans();
    const missing = [...new Set(entry.plan.points.map((p) => p.talent))].filter((t) => !entry.plan.why[t]);
    return text({
      saved: true,
      character: key,
      build: entry.plan.split,
      levels: planRuns(entry.plan.points),
      reasons_missing: missing.length ? missing : undefined,
      in_game: written ? "Written to the addon. /sync or /reload to load it." : "Couldn't write to the addon folder; /ding won't see it until that's fixed (see companion_status).",
    });
  }
);

server.registerTool(
  "get_hint",
  {
    title: "Get a hint",
    description:
      "Hints for finding a quest objective, NPC, place, object or item, one level at a time: 1 = nudge, 2 = direction, 3 = answer. The connector decides what can be revealed; only share what this returns. Pass more: true when the player asks for a bit more.",
    inputSchema: {
      target: z.string().describe("What they're looking for: a quest title, NPC, place, object or item name."),
      kind: z.enum(["quest", "npc", "place", "object", "item"]).default("place"),
      quest_id: z.number().optional(),
      more: z.boolean().optional().describe("True when the player asks for more than last time."),
      level: z.number().int().min(1).max(3).optional().describe("Only when the player explicitly asks for a specific level, e.g. 'just tell me' = 3."),
      reset: z.boolean().optional(),
      ask: z.enum(["where", "route"]).optional().describe("'route' when they know roughly where it is but not how to get there."),
      character: z.string().optional(),
    },
  },
  async (a) => {
    const ctx = context(a.character);
    return text(await getHint(a, { char: ctx.char, profile: ctx.profile, store, wiki }));
  }
);

server.registerTool(
  "before_you_go",
  {
    title: "Before you go",
    description:
      "Quests that need a place, so the player can do them in one trip: ones already in their log, plus ones not yet picked up (quest name and giver only). Use whenever the player is heading to a specific cave, dungeon, camp or area.",
    inputSchema: {
      place: z.string().describe("The place, e.g. Grizzled Den."),
      character: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async (a) => {
    const ctx = context(a.character);
    if (!ctx.char) return noSnapshot(ctx, a.character);
    return text({ freshness: freshness(ctx.char), ...(await beforeYouGo(a, { char: ctx.char, wiki })) });
  }
);

server.registerTool(
  "known_issues",
  {
    title: "Known issues",
    description:
      "Search the companion's open problem reports on GitHub, or list the most upvoted ones. Use before offering to report a problem, so duplicates become upvotes.",
    inputSchema: { query: z.string().optional().describe("A few words describing the problem. Leave empty for the most upvoted.") },
    annotations: { readOnlyHint: true },
  },
  async ({ query }) => {
    try {
      const items = query ? await searchIssues(query) : await topIssues(DATA_DIR, 8);
      return text({
        query: query || null,
        issues: items,
        how_to_use: items.length
          ? "If one matches the player's problem: say it's known, share its link and invite a 👍 (they need to be signed in to GitHub). Don't offer a new report."
          : "No matching issue. If it's clearly a bug in the companion, offer once to draft a report.",
        all_issues: `https://github.com/${REPO_SLUG}/issues?q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc`,
      });
    } catch (e) {
      return text({ problem: `Couldn't reach GitHub (${e.message}).` });
    }
  }
);

server.registerTool(
  "draft_problem_report",
  {
    title: "Draft a problem report",
    description:
      "Build a prefilled GitHub issue link for a bug in the companion, with version and game-support details attached. The player opens it, checks it and submits it themselves. Only use after known_issues found no match and the player said yes.",
    inputSchema: {
      summary: z.string().describe("One-line title, e.g. '/ding suggests the wrong talent at level 13'."),
      what_happened: z.string().describe("What the companion did, in plain words."),
      expected: z.string().describe("What should have happened."),
      character: z.string().optional(),
    },
  },
  async (a) => {
    const ctx = context(a.character);
    const diag = diagnostics(ctx.char, addonStatus);
    return text({
      link: reportLink({ ...a, diagnostics: diag }),
      included_details: diag,
      how_to_use: "Give the link in one line. Say it opens a public GitHub issue they can check and edit before submitting, and that it includes version details but no character name.",
    });
  }
);

server.registerTool(
  "save_my_hint",
  {
    title: "Save my own hint",
    description: "Store a hint the player has written for a place or quest. Their own hints are used instead of generated ones.",
    inputSchema: {
      target: z.string(),
      level_1: z.string().optional(),
      level_2: z.string().optional(),
      level_3: z.string().optional(),
      route: z.string().optional().describe("How to get there, for places that are easy to see but hard to reach."),
    },
  },
  async (a) => text({ saved: saveOwnHint(a, store) })
);

server.registerTool(
  "get_build_progress",
  {
    title: "Build progress",
    description:
      "Compares the character's talents with their locked-in talent plan: the next point to take, anything off-plan, and the next few levels. Use for 'what talent next?' questions.",
    inputSchema: { character: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ character }) => {
    const ctx = context(character);
    if (!ctx.char) return noSnapshot(ctx, character);
    return text({ character: ctx.char.name, level: ctx.char.level, freshness: freshness(ctx.char), ...buildProgress(ctx.char, ctx.charProfile) });
  }
);

server.registerTool(
  "plan_gold",
  {
    title: "Gold planner",
    description:
      "Gold now, upcoming costs (riding at 40 and any goals), and whether a purchase being considered fits. Use when the player is about to spend, or asks about saving.",
    inputSchema: {
      character: z.string().optional(),
      purchase: z.string().optional(),
      purchase_cost_gold: z.number().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async (a) => {
    const ctx = context(a.character);
    if (!ctx.char) return noSnapshot(ctx, a.character);
    return text({ character: ctx.char.name, level: ctx.char.level, freshness: freshness(ctx.char), ...planGold(ctx.char, ctx.charProfile, a) });
  }
);

server.registerTool(
  "companion_status",
  {
    title: "Companion status",
    description: "Setup check: where it's looking for the game, which snapshot files and characters it found, and where its own files live.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const { characters, files, problems } = loadCharacters(WOW_DIR);
    return text({
      wow_folder: WOW_DIR,
      snapshot_files: files.length ? files : findSavedVariableFiles(WOW_DIR),
      characters: characters.map((c) => ({
        name: c.name,
        level: c.level,
        saved: new Date((c.savedAt || 0) * 1000).toISOString(),
        addon_version: c.addonVersion,
        game_api_check: c.api || "Update the addon to 1.2 to see this",
      })),
      problems,
      data_folder: DATA_DIR,
      wiki_lookups: USE_WIKI,
      connector_version: VERSION,
      addon: addonStatus,
      updates: await updateCheck,
    });
  }
);

await server.connect(new StdioServerTransport());
