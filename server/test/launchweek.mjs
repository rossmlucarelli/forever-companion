import { getHint, saveOwnHint } from "../src/hints.js";
import { freshness } from "../src/coach.js";
let own = {};
const st = {};
const store = { hintState: () => st, saveHintState: () => {}, ownHints: () => own, saveOwnHints: (h) => { own = h; } };
const char = {
  key: "Arkin-F",
  location: { zone: "Dun Morogh", subzone: "Coldridge Valley", x: 30, y: 70 },
  visitedSubzones: ["Dun Morogh / Anvilmar", "Dun Morogh / Coldridge Valley"],
  quests: [{ questID: 3361, title: "Grund and Gozwin", zoneHeader: "Anvilmar", description: "Head back to camp in the northwestern hills.", objectives: [{ text: "0/1 Gozwin's Mechanic's Log" }] }],
};
const ctx = { char, profile: { player: { discovery_mode: true } }, store, wiki: null };
for (const a of [{}, { more: true }, { more: true }]) {
  const r = await getHint({ target: "Grund and Gozwin", kind: "quest", ...a }, ctx);
  console.log(r.hint_level, JSON.stringify(r.direction || (r.clue && "clue") || r.answer), r.ladder_exhausted ? "| EXHAUSTED + show_me" : "");
}
console.log("route, none saved:", JSON.stringify(await getHint({ target: "Grund and Gozwin", ask: "route" }, ctx)).slice(0, 150));
saveOwnHint({ target: "Grund and Gozwin", route: "The steep-looking path is walkable. Trust it." }, store);
console.log("route, saved:", JSON.stringify(await getHint({ target: "Grund and Gozwin", ask: "route" }, ctx)));
console.log("fresh:", freshness({ savedAt: Date.now() / 1000 - 60 }));
console.log("stale:", freshness({ savedAt: Date.now() / 1000 - 7200 }).slice(0, 100));
