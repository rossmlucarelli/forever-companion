// Starting data for a new player. The profile is created as profile.json in
// the player's data folder on first run, then filled in through conversation
// (update_profile) or by editing the file. Nothing personal ships here.

export const DEFAULT_PLAYER = {
  setup_needed: true,
  name: null,
  content: null,
  session_length: null,
  damage_style: null,
  cooldowns: null,
  cadence: null,
  learning: null,
  hints: "Hints before answers, never an outright 'go here' unless asked. Start every location question at level 1.",
  discovery_mode: true,
  notes: [],
};

export const DEFAULT_PROFILE = { player: DEFAULT_PLAYER, characters: {} };

// Each race's home city, whose reputation lowers riding training costs.
export const RACE_FACTION = {
  Human: "Stormwind",
  Dwarf: "Ironforge",
  Gnome: "Gnomeregan",
  "Night Elf": "Darnassus",
  Orc: "Orgrimmar",
  Troll: "Darkspear",
  Tauren: "Thunder Bluff",
  Undead: "Undercity",
};

export function ridingGoal() {
  return {
    name: "Riding and first mount",
    level: 40,
    cost_gold: 100,
    source: "looked_up",
    cost_note:
      "Beta price for riding training at level 40; the mount comes free with it. Reputation with your race's home city gives 5% (Friendly) to 20% (Exalted) off. Confirm the price at the trainer.",
    remind: true,
  };
}

// A fresh profile entry for a character seen in the game for the first time.
export function newCharacter(snap) {
  return {
    setup_needed: true,
    race: snap?.race || null,
    class: snap?.class || null,
    spec: null,
    professions: [],
    plan: null,
    priorities: [],
    ruled_out: [],
    cooldown_rules: {},
    goals: [ridingGoal()],
    notes: [],
  };
}

// Where a fact came from. Shown in replies as a small mark after the fact.
// Filled to empty = most to least certain.
export const LABELS = {
  game: "◆ your game", // read from your Forever client: certain
  told: "◈ you told me", // the player said so in this conversation: newer than the snapshot
  looked_up: "◇ looked up", // a Forever guide or the wiki: may lag or reflect Classic
  unconfirmed: "○ unconfirmed", // general WoW knowledge (Classic or retail), not confirmed for Forever
};

// Zones that are new in Forever. Discovery mode caps hints here at level 2.
export const NEW_ZONES = ["Riverglades", "Zephras Isle", "Mount Hyjal", "Shen'dralas"];

// The world's zones (Classic plus Forever's new ones). Anything else the wiki
// names is treated as an area inside a zone.
export const ZONES = [
  "Dun Morogh", "Elwynn Forest", "Teldrassil", "Durotar", "Mulgore", "Tirisfal Glades", "Loch Modan",
  "Westfall", "Darkshore", "The Barrens", "Silverpine Forest", "Redridge Mountains", "Duskwood",
  "Wetlands", "Ashenvale", "Stonetalon Mountains", "Hillsbrad Foothills", "Thousand Needles",
  "Alterac Mountains", "Arathi Highlands", "Desolace", "Stranglethorn Vale", "Dustwallow Marsh",
  "Badlands", "Swamp of Sorrows", "Feralas", "Tanaris", "The Hinterlands", "Searing Gorge",
  "Azshara", "Blasted Lands", "Un'Goro Crater", "Felwood", "Burning Steppes", "Western Plaguelands",
  "Eastern Plaguelands", "Winterspring", "Deadwind Pass", "Moonglade", "Silithus",
  "Stormwind City", "Ironforge", "Darnassus", "Orgrimmar", "Thunder Bluff", "Undercity",
  ...NEW_ZONES,
];
