// The hint ladder. The connector works out the full answer, then hands Claude
// only what the requested level allows, so Claude can't give away more than
// the player has asked for.
import { NEW_ZONES, LABELS, ZONES } from "./defaults.js";

const isZone = (z) => !!z && ZONES.some((x) => x.toLowerCase() === String(z).toLowerCase());
import { asArray } from "./wow.js";

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

function compass(dx, dy) {
  // Map y grows southwards.
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI; // 0 = east, 90 = north
  const dirs = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
  return dirs[Math.round((((angle % 360) + 360) % 360) / 45) % 8];
}

function distanceWords(d) {
  if (d < 6) return "very close to where you last were";
  if (d < 15) return "a short walk";
  if (d < 30) return "a fair walk";
  return "towards the far side of the zone";
}

function findQuest(char, target, questId) {
  const quests = asArray(char?.quests);
  if (questId) {
    const q = quests.find((x) => Number(x.questID) === Number(questId));
    if (q) return q;
  }
  const t = norm(target);
  return quests.find((q) => norm(q.title) === t) || quests.find((q) => norm(q.title).includes(t) && t.length > 3);
}

// Gathers everything known about the target. Not returned to Claude directly.
async function resolve({ kind, target, questId }, char, wiki) {
  const facts = { kind, target, sources: [] };

  if (kind === "quest") {
    const q = findQuest(char, target, questId);
    if (q) {
      facts.inQuestLog = true;
      facts.questTitle = q.title;
      facts.questText = [q.description, q.objectiveText].filter(Boolean).join("\n\n") || null;
      facts.objectives = asArray(q.objectives).map((o) => `${o.text}${o.finished ? " (done)" : ""}`);
      facts.complete = !!q.complete;
      facts.zone = q.zoneHeader || null;
      if (facts.zone && !isZone(facts.zone)) {
        // A quest-log header like "Anvilmar" is an area. Find the zone it sits in.
        const area = facts.zone;
        const seen = (char?.visitedSubzones || []).find((v) => norm(v).endsWith(" / " + norm(area)));
        // The header is where the game files the quest, not where to go.
        facts.filedUnder = area;
        facts.zone = seen ? seen.split(" / ")[0] : char?.location?.zone || null;
      }
      facts.textOrigin = "game";
      facts.locationOrigin = facts.zone ? "game" : null;
      if (q.waypoint && q.waypoint.x != null) {
        if (isZone(q.waypoint.mapName)) facts.zone = q.waypoint.mapName;
        facts.coords = { x: q.waypoint.x, y: q.waypoint.y };
        facts.sources.push("the game's own quest marker");
        facts.locationOrigin = "game";
      }
      if (!facts.coords && facts.complete && wiki) {
        try {
          const page = await wiki.lookup(q.title, "quest");
          if (page?.questEnd) {
            const npc = await wiki.lookup(page.questEnd, "npc");
            if (npc) {
              Object.assign(facts, { zone: npc.zone || facts.zone, subzone: npc.subzone, coords: npc.coords, turnInNpcRole: npc.role });
              facts.locationOrigin = npc.mentionsForever ? "looked_up" : "looked_up_classic";
            }
            facts.sources.push(npc?.url || page.url);
          }
        } catch (e) {
          facts.wikiError = e.message;
        }
      }
      return facts;
    }
    if (wiki) {
      try {
        const page = await wiki.lookup(target, "quest");
        if (page) {
          facts.questTitle = page.title;
          facts.sources.push(page.url);
          if (page.questStart) {
            const npc = await wiki.lookup(page.questStart, "npc");
            if (npc) {
              Object.assign(facts, { zone: npc.zone, subzone: npc.subzone, coords: npc.coords, giverRole: npc.role || npc.creatureType });
              facts.locationOrigin = facts.textOrigin = npc.mentionsForever ? "looked_up" : "looked_up_classic";
            }
          }
          facts.zone = facts.zone || page.zone;
        }
      } catch (e) {
        facts.wikiError = e.message;
      }
    }
    return facts;
  }

  if (wiki) {
    try {
      const page = await wiki.lookup(target, kind);
      if (page) {
        Object.assign(facts, {
          zone: page.zone,
          subzone: kind === "place" ? page.subzone || page.title : page.subzone,
          coords: page.coords,
          role: page.role,
          creatureType: page.creatureType,
          affiliation: page.affiliation,
          wikiTitle: page.title,
        });
        facts.locationOrigin = facts.textOrigin = page.mentionsForever ? "looked_up" : "looked_up_classic";
        facts.sources.push(page.url);
      }
    } catch (e) {
      facts.wikiError = e.message;
    }
  }
  return facts;
}

function visitedSubzone(char, zone, subzone) {
  if (!subzone) return false;
  const list = (char?.visitedSubzones || []).map(norm);
  return list.includes(norm(`${zone} / ${subzone}`)) || list.some((s) => s.endsWith(" / " + norm(subzone)));
}

function sameZone(char, zone) {
  const loc = char?.location || {};
  return zone && [loc.zone, loc.mapName].some((z) => norm(z) === norm(zone));
}

export async function getHint(args, ctx) {
  const { char, profile, store, wiki } = ctx;
  const kind = args.kind || "place";
  const key = `${char?.key || "player"}|${kind}|${norm(args.target)}`;
  const state = store.hintState();
  const prev = state[key]?.level || 0;

  const own = store.ownHints()[norm(args.target)] || null;

  // "How do I get there?" is about the route, not the place.
  if (args.ask === "route") {
    if (own?.route) return { target: args.target, route: own.route, source: "the player's own hint (no label needed)" };
    return {
      target: args.target,
      route: null,
      note: "No route is known for this. Routes only come from the player's own hints or a video.",
      show_me: SHOW_ME,
    };
  }
  const facts = await resolve({ kind, target: args.target, questId: args.quest_id }, char, wiki);

  const isNewZone = NEW_ZONES.some((z) => norm(z) === norm(facts.zone));
  const discovery = profile.player?.discovery_mode !== false && isNewZone && !args.override_discovery_mode;
  const hasAnswer = !!(facts.coords || facts.subzone || own?.["3"]);
  let maxLevel = discovery ? 2 : 3;
  if (!hasAnswer && !facts.zone && !own) maxLevel = 1;
  else if (!hasAnswer) maxLevel = Math.min(maxLevel, 2);

  let level;
  if (args.reset) level = 1;
  else if (args.level) level = args.level;
  else if (args.more) level = prev + 1;
  else level = prev || 1;
  const wanted = level;
  level = Math.max(1, Math.min(level, maxLevel));

  state[key] = { level, target: args.target, kind, at: new Date().toISOString() };
  store.saveHintState(state);

  const out = {
    target: args.target,
    hint_level: level,
    highest_level_available: maxLevel,
    asked_for_level: wanted,
    discovery_mode_cap: discovery && wanted > 2 ? `${facts.zone} is new in Forever and discovery mode is on, so hints stop at level 2. The player can switch discovery mode off with update_profile.` : null,
  };

  if (own?.[String(level)]) {
    out.players_own_hint = own[String(level)];
  } else if (level === 1) {
    const clue = {};
    if (facts.questText) clue.quest_text = facts.questText;
    if (facts.objectives?.length) clue.objectives = facts.objectives;
    if (facts.role) clue.what_it_is = facts.role;
    if (facts.creatureType && !facts.role) clue.what_it_is = facts.creatureType;
    if (facts.giverRole) clue.who_gives_it = facts.giverRole;
    if (facts.turnInNpcRole) clue.who_to_return_to = facts.turnInNpcRole;
    if (facts.affiliation) clue.affiliation = facts.affiliation;
    if (facts.complete) clue.status = "All objectives are done; it's ready to hand in.";
    out.clue = Object.keys(clue).length ? clue : { note: "Nothing beyond the name is known. Give a gentle, general nudge (who in the world might know), or say it isn't documented yet." };
  } else if (level === 2) {
    const dir = {};
    if (facts.zone) dir.zone = facts.zone;
    if (facts.filedUnder) dir.quest_filed_under = `${facts.filedUnder} (the game's quest-log heading: where the quest belongs, not necessarily where to go)`;
    if (facts.subzone && visitedSubzone(char, facts.zone, facts.subzone)) dir.known_landmark = facts.subzone;
    else if (facts.subzone) dir.note = "The exact area is somewhere this character hasn't been yet, so don't name it.";
    if (facts.coords && sameZone(char, facts.zone) && char?.location?.x != null) {
      const dx = facts.coords.x - char.location.x;
      const dy = facts.coords.y - char.location.y;
      dir.direction_from_last_position = compass(dx, dy);
      dir.how_far = distanceWords(Math.hypot(dx, dy));
      if (char.location.subzone) dir.measured_from = char.location.subzone;
    }
    if (!Object.keys(dir).length) dir.note = "Nothing more specific is known yet. Say so.";
    out.direction = dir;
  } else {
    out.answer = {
      zone: facts.zone,
      area: facts.subzone || null,
      coordinates: facts.coords ? `${facts.coords.x}, ${facts.coords.y}` : null,
    };
  }

  // Label where this level's information came from.
  const origin = out.players_own_hint ? "own" : level === 1 ? facts.textOrigin || facts.locationOrigin : facts.locationOrigin;
  if (origin === "own") out.source = "the player's own hint (no label needed)";
  else if (origin === "game") out.source = LABELS.game;
  else if (origin === "looked_up") out.source = LABELS.looked_up;
  else if (origin === "looked_up_classic")
    out.source = `${LABELS.looked_up} — the wiki page doesn't mention Forever, so this may be the Classic location. Say so briefly.`;
  out.sources = facts.sources;

  // Dead end: the ladder has nothing more to give.
  const emptyAnswer = out.answer && !out.answer.zone && !out.answer.area && !out.answer.coordinates;
  if (level >= maxLevel && (maxLevel < 3 || emptyAnswer)) {
    out.ladder_exhausted = true;
    out.show_me = out.discovery_mode_cap
      ? { ...SHOW_ME, first: "Discovery mode is on here. Check the player really wants to see it before searching." }
      : SHOW_ME;
  }
  if (facts.wikiError) out.wiki_unavailable = `The wiki couldn't be reached (${facts.wikiError}).`;
  if (!facts.zone && !facts.subzone && !facts.questText && !facts.role && !facts.creatureType && !own) {
    out.not_found =
      "Nothing documented for this yet. Forever's new content may not be on the wiki for a few weeks. Say so plainly; do not search the web for the answer.";
  }
  out.how_to_use =
    level < maxLevel
      ? `Turn this into one short hint in your own words. Add nothing that isn't here, and don't look the answer up elsewhere. If they want more, call get_hint again with more: true (next is level ${level + 1}).`
      : "This is the most the ladder gives for this. Share it plainly.";
  return out;
}

const SHOW_ME = {
  available: true,
  offer: "Offer, in one short line, to find a video that shows it. Only search if they say yes.",
  rules: [
    "Search the web for one YouTube video of this exact quest or place in World of Warcraft: Forever.",
    "Pick a video whose title or description says Forever, posted on or after 4 November 2026. Classic and retail videos often share quest names: avoid them.",
    "Give one link, with a timestamp (&t=) to the relevant moment if the description or chapters show one. Add one line on what it shows. Don't describe the whole solution.",
    "Mark it ◇. If you can't confirm it's Forever, say so plainly.",
    "Afterwards, offer to save what they learned as their own hint with save_my_hint.",
  ],
};

export function saveOwnHint(args, store) {
  const all = store.ownHints();
  const k = norm(args.target);
  all[k] = { ...(all[k] || {}) };
  for (const l of ["1", "2", "3"]) {
    const v = args[`level_${l}`];
    if (v) all[k][l] = v;
  }
  if (args.route) all[k].route = args.route;
  store.saveOwnHints(all);
  return all[k];
}
