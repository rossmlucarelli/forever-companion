// Character summary, build progress against the locked-in plan, and the gold planner.
import { LABELS, RACE_FACTION } from "./defaults.js";
import { asArray, formatMoney, gold, snapshotAge } from "./wow.js";

const norm = (s) => String(s || "").trim().toLowerCase();

export function freshness(char) {
  const mins = Math.round((Date.now() / 1000 - (char.savedAt || 0)) / 60);
  if (mins < 20) return null;
  return `This snapshot was taken ${snapshotAge(char.savedAt)}. If they've played since, say so briefly and ask what's changed, or suggest /sync (or /ding if they've levelled). Anything they tell you that's newer wins over the snapshot: mark it ${LABELS.told}.`;
}

export function summarise(char, charProfile) {
  const loc = char.location || {};
  const quests = asArray(char.quests);
  return {
    source: LABELS.game,
    freshness: freshness(char),
    name: char.name,
    profile_name: charProfile?.full_name || null,
    snapshot_taken: snapshotAge(char.savedAt),
    snapshot_reason: char.reason || null,
    level: char.level,
    xp: char.xpMax ? `${Math.round(((char.xp || 0) / char.xpMax) * 100)}% through the level` : null,
    rested: char.restedXP ? "has rested XP" : "no rested XP",
    race: char.race,
    class: char.class,
    faction: char.faction,
    gold: formatMoney(char.money),
    last_seen_at: [loc.subzone, loc.zone].filter(Boolean).join(", ") || null,
    in_instance: !!loc.inInstance,
    talents: asArray(char.talents).map((t) => ({
      tree: t.name,
      points: t.spent,
      taken: asArray(t.talents).filter((x) => x.rank > 0).map((x) => `${x.name} ${x.rank}/${x.maxRank}`),
    })),
    unspent_talent_points: char.unspentTalentPoints ?? null,
    gear: asArray(char.gear).filter((g) => g.slot !== "Shirt" && g.slot !== "Tabard").map((g) => `${g.slot}: ${g.name}`),
    professions_and_skills: asArray(char.skills).map((s) => `${s.name} ${s.rank}/${s.maxRank}`),
    knows_riding: !!char.knowsRiding,
    quests: quests.map((q) => `${q.title}${q.level ? ` (level ${q.level})` : ""}${q.complete ? " — ready to hand in" : ""}`),
    bag_space_free: char.freeBagSlots ?? null,
    bags: asArray(char.bags).map((b) => `${b.name} x${b.count}`),
    reputations: asArray(char.reputations)
      .filter((r) => !/Neutral/i.test(String(r.standing)))
      .map((r) => `${r.name}: ${r.standing}`),
    partial_snapshot: !!char.partial,
    kept_from_earlier_snapshot: char.kept ? asArray(char.kept) : undefined,
  };
}

export function reminders(char, charProfile) {
  const out = [];
  const lvl = Number(char.level) || 0;
  for (const g of asArray(charProfile?.goals)) {
    if (!g.remind) continue;
    if (/riding/i.test(g.name) && char.knowsRiding) continue;
    if (lvl >= g.level) out.push(`${g.name} is available now (level ${g.level}). Visit the trainer. ${g.cost_note || ""}`.trim());
    else if (g.level - lvl <= 5) {
      const need = g.cost_gold ? `about ${g.cost_gold}g needed, ${formatMoney(char.money)} saved` : "";
      const mark = g.source && LABELS[g.source] ? ` (cost ${LABELS[g.source]})` : "";
      out.push(`${g.name} at level ${g.level}, ${g.level - lvl} level${g.level - lvl === 1 ? "" : "s"} away${need ? ": " + need : ""}${mark}.`);
    }
  }
  if ((char.unspentTalentPoints || 0) > 0) out.push(`${char.unspentTalentPoints} unspent talent point(s).`);
  return out;
}

export function buildProgress(char, charProfile) {
  const plan = charProfile?.plan;
  if (!plan?.points?.length)
    return { note: "No talent plan for this character yet. Ask for a link from the Icy Veins WoW Forever talent calculator, with the talents chosen in the order they'll be taken, and save it with set_talent_plan." };
  const current = {};
  for (const tree of asArray(char.talents))
    for (const t of asArray(tree.talents)) current[norm(t.name)] = Number(t.rank) || 0;

  const haveData = Object.keys(current).length > 0;
  // Walk the plan in order and find the first point not yet taken.
  const taken = {};
  let next = null;
  const offPlan = [];
  for (const p of plan.points) {
    taken[norm(p.talent)] = (taken[norm(p.talent)] || 0) + 1;
    if (!next && (current[norm(p.talent)] || 0) < taken[norm(p.talent)]) next = p;
  }
  for (const [name, rank] of Object.entries(current)) {
    if (rank > 0 && !(name in taken)) offPlan.push(name);
  }
  const level = Number(char.level) || 0;
  const due = plan.points.filter((p) => p.level <= level);
  const spentInPlan = plan.points.filter((p) => {
    const k = norm(p.talent);
    return (current[k] || 0) >= p.rank;
  }).length;
  const upcoming = plan.points.filter((p) => p.level > level).slice(0, 5);

  return {
    source: `${LABELS.game} for what's taken; the plan is the player's own (no label)`,
    plan: plan.split,
    plan_link: plan.link,
    talent_data_in_snapshot: haveData,
    points_due_by_this_level: due.length,
    plan_points_taken: spentInPlan,
    next_point: next ? `${next.talent} (rank ${next.rank} of ${next.of}, ${next.tree}) — planned for level ${next.level}` : "Build complete",
    why: next ? plan.why?.[next.talent] || null : null,
    behind_plan: haveData && spentInPlan < due.length ? due.length - spentInPlan : 0,
    talents_not_in_plan: offPlan,
    next_few_levels: upcoming.map((p) => `Level ${p.level}: ${p.talent} ${p.rank}/${p.of}`),
    talent_names_note: haveData
      ? null
      : "The snapshot has no talent data (the game's talent API may differ in Forever). Ask the player what they've taken so far.",
  };
}

const DISCOUNT = { Friendly: 0.05, Honored: 0.1, Revered: 0.15, Exalted: 0.2 };

export function planGold(char, charProfile, args = {}) {
  const have = gold(char.money);
  const lvl = Number(char.level) || 0;
  const home = RACE_FACTION[char.race];
  const rep = home ? asArray(char.reputations).find((r) => String(r.name).toLowerCase().includes(home.toLowerCase())) : null;
  const discount = rep ? DISCOUNT[rep.standing] || 0 : 0;

  const goals = asArray(charProfile?.goals)
    .filter((g) => !(/riding/i.test(g.name) && char.knowsRiding))
    .filter((g) => !g.done)
    .map((g) => {
      const cost = g.cost_gold ? Math.round(g.cost_gold * (/riding/i.test(g.name) ? 1 - discount : 1) * 100) / 100 : null;
      return {
        goal: g.name,
        at_level: g.level,
        levels_away: Math.max(0, g.level - lvl),
        cost_gold: cost,
        note: g.cost_note || null,
        source: g.source ? LABELS[g.source] || g.source : "the player's own figure (no label)",
        discount_applied: /riding/i.test(g.name) && discount ? `${discount * 100}% (${rep.standing} with ${rep.name})` : null,
      };
    })
    .sort((a, b) => a.at_level - b.at_level);

  const nextGoal = goals.find((g) => g.cost_gold);
  const result = {
    gold_now: `${formatMoney(char.money)} (${LABELS.game})`,
    upcoming: goals,
    also_budget_for: `${LABELS.unconfirmed} Spell training at the class trainer every couple of levels${
      asArray(char.skills).length || charProfile?.professions?.length ? ", plus profession training" : ""
    }. Exact Forever prices aren't confirmed yet.`,
  };
  if (nextGoal) {
    result.short_by = have >= nextGoal.cost_gold ? 0 : Math.round((nextGoal.cost_gold - have) * 100) / 100;
  }
  if (args.purchase_cost_gold != null) {
    const after = Math.round((have - Number(args.purchase_cost_gold)) * 100) / 100;
    let verdict = "fine";
    if (after < 0) verdict = "can't afford it";
    else if (nextGoal && after < nextGoal.cost_gold && nextGoal.levels_away <= 6) verdict = `would leave you short for ${nextGoal.goal} (${nextGoal.levels_away} levels away)`;
    else if (nextGoal && after < nextGoal.cost_gold) verdict = `affordable, but sets back saving for ${nextGoal.goal}`;
    result.purchase = { item: args.purchase || null, cost_gold: Number(args.purchase_cost_gold), gold_after: after, verdict };
  }
  result.how_to_use = "Give a gentle heads-up, not a budget. One or two sentences.";
  return result;
}
