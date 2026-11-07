# Forever Companion

A coach for **World of Warcraft: Forever** that lives in Claude. It knows your character, learns how you like to play, and helps you find your way with hints rather than spoilers.

It never touches the running game. An in-game addon saves a snapshot of your character when you ask it to, and the connector reads that file. Everything else is advice.

## What it does

- **Knows your character.** Level, gold, gear, talents, professions, quests and reputation, read from your own game.
- **Learns how you play.** A short chat on first use: solo or groups, steady damage or bursts, how you get on with long cooldowns, how much help you want. Every suggestion fits that.
- **Hints, not routes.** Ask where something is and you get a nudge first. Ask for "a bit more" and it moves one step: nudge, then direction, then answer. In Forever's new zones, discovery mode stops at direction unless you switch it off.
- **Talent plans.** Paste a build link from the [Icy Veins WoW Forever talent calculator](https://www.icy-veins.com/wow-forever/priest-talent-calculator), picked in the order you'll take the talents. Type `/ding` in game when you level and it tells you the next one, and why.
- **Before you go.** Say where you're heading and it lists the quests that need that place, including ones you haven't picked up yet (just the name and who gives it), so you do everything in one trip.
- **Gold planner.** Warns you before a purchase leaves you short for riding at 40, or anything else you're saving for.
- **Every character, separately.** Each gets its own plan and goals; your playstyle and the hints you save are shared.
- **Honest about sources.** Facts carry a small mark: ◆ your game · ◈ you told me · ◇ looked up · ○ unconfirmed for Forever. Forever shares names with Classic and retail, so this matters.

## What you need

- World of Warcraft: Forever
- The [Claude desktop app](https://claude.ai/download) on the same computer as the game (Windows or Mac)

## Install

1. Download `forever-companion.mcpb` from the [latest release](https://github.com/rossmlucarelli/forever-companion/releases/latest).
2. In the Claude desktop app: **Settings → Desktop app → Extensions → Manage → Advanced settings → Install Extension…**, and choose the file.
3. Check the **WoW folder** setting points at your World of Warcraft folder.
4. Start a new chat and ask: *"Check the Forever Companion status."*

The connector installs the in-game addon for you. Restart the game the first time so it loads. After that, updating the connector updates the addon too, and the connector lets you know when a new version is out.

If Windows won't let it write to the game folder, unzip `ForeverCompanion-addon.zip` from the release into `World of Warcraft\_forever_\Interface\AddOns` instead.

## In game

| Command | What it does |
| --- | --- |
| `/ding` | Shows your next talent and why, then saves so Claude sees your new level. |
| `/sync` | Saves now so Claude is up to date, such as after a big quest hand-in. |
| `/companion` | Takes a snapshot without reloading. |

`/ding` and `/sync` reload the interface, which is how WoW saves addon data. Both can go on keys under Options → Keybindings → AddOns. Neither works mid-fight.

## Things to ask

- *"How's my character doing?"*
- *"Ding!"*
- *"Where do I find the camp for this quest?"* … *"a bit more?"*
- *"How do I get up there?"* — route hints from ones you've saved
- *"Show me"* — once the hints run out, one Forever video, only if you ask
- *"I'm heading into the Grizzled Den"* — before you go
- *"Should I buy this for 30 gold?"*
- *"Here's my talent build:"* followed by your calculator link

## Privacy and the rules

- Everything stays on your computer: your profile, hints and snapshots live in `Documents\ForeverCompanion` as plain files you can read and edit.
- The only things it fetches are page lookups on [warcraft.wiki.gg](https://warcraft.wiki.gg) and a daily update check against this repository's releases. Both can be switched off in the connector's settings.
- The addon only reads what the game's own addon interface offers, never reads anything in combat, and never acts in the game: no automation, no chat, no auction house.

## Known limits

- Built against Forever's beta. If the live game differs, that part of the snapshot is skipped rather than breaking; *"check the Forever Companion status"* shows which game functions work.
- New Forever content takes a few weeks to reach the wiki. Quest hints still work from your own quest log.
- Talent structure comes from the Icy Veins calculator at release time. If they change their link format, plans need a new version.

## Building from source

```
cd server && npm ci
node ../scripts/build.mjs
```

This writes `dist/forever-companion.mcpb` (the connector with the addon inside) and `dist/ForeverCompanion-addon.zip`.

## Credits

Location data from [warcraft.wiki.gg](https://warcraft.wiki.gg), under CC BY-SA. Talent build links from the [Icy Veins](https://www.icy-veins.com) WoW Forever calculator. World of Warcraft is a trademark of Blizzard Entertainment; this project isn't affiliated with Blizzard or Icy Veins.

Made by Ross Lucarelli. MIT licence.
