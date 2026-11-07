// "Before you go": when the player heads somewhere, list the quests that need
// that place. Quests already in the log come from the game; ones not yet
// picked up come from the wiki (name and quest giver only, to avoid spoilers).
import { LABELS } from "./defaults.js";
import { extractFacts, plain } from "./wiki.js";
import { asArray } from "./wow.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

function questText(q) {
  return norm([q.title, q.description, q.objectiveText, ...asArray(q.objectives).map((o) => o.text)].join(" "));
}

const param = (text, names) => {
  for (const n of names) {
    const m = new RegExp(`\\|\\s*${n}\\s*=\\s*([^\\n|]*)`, "i").exec(text);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
};

export function questInfo(page) {
  const t = page.text;
  const isQuest = /\{\{\s*Questbox/i.test(t) || (param(t, ["start"]) && param(t, ["end"]) && /\b(quest|objectives?)\b/i.test(t));
  if (!isQuest) return null;
  const levelRaw = plain(param(t, ["level"]) || "");
  const level = Number(/(\d+)/.exec(levelRaw)?.[1]) || null;
  const req = Number(plain(param(t, ["levelreq", "reqlevel", "requires"]) || "").match(/\d+/)?.[0]) || Number(/requires\s*(\d+)/i.exec(levelRaw)?.[1]) || null;
  const faction = /\|\s*faction\s*=\s*(alliance|horde)/i.exec(t)?.[1] || (/\bHorde\b/.test(t) && !/\bAlliance\b/.test(t) ? "Horde" : /\bAlliance\b/.test(t) && !/\bHorde\b/.test(t) ? "Alliance" : null);
  const id = Number(/\|\s*id\s*=\s*(\d+)/i.exec(t)?.[1] || /quest[=/](\d+)/i.exec(t)?.[1]) || null;
  return { title: page.title, start: plain(param(t, ["start", "starts"]) || "") || null, level, req, faction, id };
}

export async function beforeYouGo({ place }, { char, wiki }) {
  const p = norm(place);
  const quests = asArray(char?.quests);
  const lvl = Number(char?.level) || 1;
  const out = { place, source_in_log: LABELS.game };

  // 1. Quests already in the log that mention the place.
  const inLog = quests.filter((q) => questText(q).includes(p));
  out.in_your_log = inLog.map((q) => ({
    quest: q.title,
    status: q.complete ? "ready to hand in" : asArray(q.objectives).map((o) => o.text).filter(Boolean).join("; ") || "in progress",
  }));

  // 2. Quests not yet picked up that send people there (from the wiki).
  if (!wiki) {
    out.not_yet_picked_up = { note: "Wiki lookups are switched off." };
    return finish(out);
  }
  try {
    const pages = await wiki.pagesMentioning(place, 30);
    const have = new Set(quests.map((q) => norm(q.title)));
    const done = new Set(asArray(char?.completedQuests).map(Number));
    const faction = char?.faction;
    const candidates = pages
      .map(questInfo)
      .filter(Boolean)
      .filter((q) => !have.has(norm(q.title)))
      .filter((q) => !(q.id && done.has(q.id)))
      .filter((q) => !faction || !q.faction || q.faction.toLowerCase() === faction.toLowerCase())
      .filter((q) => (q.req ? q.req <= lvl + 2 : true) && (q.level ? q.level >= lvl - 6 && q.level <= lvl + 6 : true))
      .sort((a, b) => (a.level || 99) - (b.level || 99))
      .slice(0, 6);

    // Where each quest giver is.
    const givers = [...new Set(candidates.map((c) => c.start).filter(Boolean))];
    const giverPages = await wiki.pages(givers).catch(() => []);
    const where = {};
    for (const g of giverPages) {
      const f = extractFacts(g.text);
      where[norm(g.title)] = [f.subzone, f.zone].filter(Boolean).join(", ") || null;
    }
    out.not_yet_picked_up = candidates.map((c) => ({
      quest: c.title,
      from: c.start || "unknown",
      where: (c.start && where[norm(c.start)]) || null,
      level: c.level || null,
    }));
    out.wiki_pages_checked = pages.length;
    out.source_not_picked_up = `${LABELS.looked_up} — from the wiki, which mostly describes Classic. Some may differ or not exist in Forever, and ones you've already done may slip through.`;
  } catch (e) {
    out.not_yet_picked_up = { note: `Couldn't reach the wiki (${e.message}).` };
  }
  return finish(out);
}

function finish(out) {
  out.how_to_use =
    "Keep it short. First the quests in their log that need this place, so they can do them in one trip. Then, if any, the ones not yet picked up: quest name, who gives it and where, and nothing about what the quest involves. Mark the log ones ◆ and the others ◇. If there's nothing, say so in a line.";
  return out;
}
