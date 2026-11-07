// 1.5 checks: hand-in markers and vendors.
import { getHint } from "../src/hints.js";
const store = { hintState: () => ({}), saveHintState: () => {}, ownHints: () => ({}) };
const profile = { player: {} };
// Stocking Jetsteam: incomplete, marker points at the hand-in.
const char = {
  key: "Arkin-F", location: { zone: "Dun Morogh", x: 40, y: 60 }, visitedZones: ["Dun Morogh"], visitedSubzones: [],
  quests: [
    { questID: 317, title: "Stocking Jetsteam", zoneHeader: "Dun Morogh", complete: false, description: "boars south of the Grizzled Den", waypoint: { mapName: "Dun Morogh", x: 49.7, y: 48.9, source: "waypoint" } },
    { questID: 318, title: "Done Quest", zoneHeader: "Dun Morogh", complete: true, waypoint: { mapName: "Dun Morogh", x: 49.7, y: 48.9, source: "waypoint" } },
  ],
};
for (const [t, lvl] of [["Stocking Jetsteam", 2], ["Stocking Jetsteam", 3], ["Done Quest", 3]]) {
  const r = await getHint({ target: t, kind: "quest", level: lvl }, { char, profile, store, wiki: null });
  console.log(t, lvl, JSON.stringify(r.direction || r.answer), r.ladder_exhausted ? "| show_me" : "");
}
// Rhapsody Malt: vendor from the wiki.
const wiki = {
  lookup: async (name) =>
    name === "Rhapsody Malt"
      ? { title: name, url: "u1", mentionsForever: false, vendors: [{ name: "Yanni Stoutheart", title: "General Supplies", zone: "Loch Modan" }, { name: "Innkeeper Belm", title: "Innkeeper", zone: "Dun Morogh" }] }
      : { title: name, url: "u2", zone: "Dun Morogh", subzone: "Kharanos", coords: { x: 47.4, y: 52.4 }, role: "Innkeeper" },
};
for (const lvl of [1, 2, 3]) {
  const r = await getHint({ target: "Rhapsody Malt", kind: "item", level: lvl }, { char, profile, store, wiki });
  console.log("Rhapsody Malt", lvl, JSON.stringify(r.clue || r.direction || r.answer));
}
