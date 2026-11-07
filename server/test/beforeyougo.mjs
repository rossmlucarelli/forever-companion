import { beforeYouGo, questInfo } from "../src/beforeyougo.js";
const page = (title, text) => ({ title, text });
const wiki = {
  pagesMentioning: async () => [
    page("Frosthowl", "{{Questbox\n| start = [[Gretta Ganter]]\n| end = [[Gretta Ganter]]\n| level = 9 (Requires 5)\n| faction = Alliance\n}}\nFrosthowl hides in the [[Grizzled Den]]. {{wowhead|quest=6064}}"),
    page("Secure the Mountain", "{{Questbox\n| start = [[Mountaineer Gretchen]]\n| end = [[Mountaineer Gretchen]]\n| level = 8\n}} Grizzled Den {{wowhead|quest=6001}}"),
    page("Wendigo Mane", "{{Questbox\n| start = [[Old Timberbeard]]\n| end = [[Old Timberbeard]]\n| level = 7 (Requires 4)\n}}\nCollect manes in the [[Grizzled Den]]. quest=313"),
    page("Horde Thing", "{{Questbox\n| start = [[Someone]]\n| end = [[Someone]]\n| faction = Horde\n| level = 9\n}} Grizzled Den"),
    page("Raid Thing", "{{Questbox\n| start = [[Bigboss]]\n| end = [[Bigboss]]\n| level = 58\n}} Grizzled Den"),
    page("Grizzled Den", "{{Subzonebox}} A cave full of wendigos."),
  ],
  pages: async (titles) => titles.map((t) => page(t, t === "Old Timberbeard" ? "{{Npcbox\n| location = [[Grizzled Den]], [[Dun Morogh]]\n}}" : "{{Npcbox\n| location = [[Brewnall Village]], [[Dun Morogh]]\n}}")),
};
const char = {
  level: 10, faction: "Alliance", completedQuests: [313],
  quests: [
    { title: "Frosthowl", description: "Drooling brute is hiding somewhere deep in the Grizzled Den to the southeast.", objectives: [{ text: "0/1 Sack of Fish" }] },
    { title: "Data Hoarders", description: "Something else entirely." },
  ],
};
const r = await beforeYouGo({ place: "Grizzled Den" }, { char, wiki });
console.log(JSON.stringify({ in_your_log: r.in_your_log, not_yet_picked_up: r.not_yet_picked_up }, null, 1));
