-- Forever Companion
-- Saves a read-only snapshot of your character so the Forever Companion
-- connector in Claude can coach you. It never presses buttons, never acts
-- in combat and never sends anything anywhere: the game writes the snapshot
-- to its SavedVariables file when you log out or type /reload.

local ADDON = ...
local VERSION = "1.4.0"

ForeverCompanionDB = ForeverCompanionDB or {}

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Run an API call safely. Forever shares the modern UI code but keeps Classic
-- systems, so some calls may be missing or behave differently. Any failure
-- just leaves that part of the snapshot empty.
local function try(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, a, b, c, d, e, f, g, h, i, j = pcall(fn, ...)
  if ok then return a, b, c, d, e, f, g, h, i, j end
  return nil
end

-- Never store protected ("secret") values. These only appear in combat, and
-- the addon never snapshots in combat anyway, but this keeps it safe.
local function clean(v)
  if v == nil then return nil end
  if issecretvalue and try(issecretvalue, v) then return nil end
  local t = type(v)
  if t == "string" or t == "number" or t == "boolean" then return v end
  return nil
end

local function round(n, places)
  if type(n) ~= "number" then return nil end
  local m = 10 ^ (places or 1)
  return math.floor(n * m + 0.5) / m
end

local function itemIdFromLink(link)
  if type(link) ~= "string" then return nil end
  local id = link:match("item:(%d+)")
  return id and tonumber(id) or nil
end

local function itemName(linkOrId)
  local name, _, quality
  if C_Item and C_Item.GetItemInfo then
    name, _, quality = try(C_Item.GetItemInfo, linkOrId)
  end
  if not name and GetItemInfo then
    name, _, quality = try(GetItemInfo, linkOrId)
  end
  if not name and type(linkOrId) == "string" then
    name = linkOrId:match("%[(.-)%]")
  end
  return clean(name), clean(quality)
end

local function charKey()
  local name = UnitName("player")
  local realm = try(GetRealmName) or "Forever"
  return (name or "Unknown") .. "-" .. (realm or "Forever")
end

-- ---------------------------------------------------------------------------
-- Snapshot sections
-- ---------------------------------------------------------------------------

local function basics(s)
  s.name = clean(UnitName("player"))
  s.realm = clean(try(GetRealmName))
  s.level = clean(UnitLevel("player"))
  local className, classFile = UnitClass("player")
  s.class = clean(className)
  s.classFile = clean(classFile)
  s.race = clean(try(UnitRace, "player"))
  s.faction = clean(try(UnitFactionGroup, "player"))
  s.sex = ({ [2] = "male", [3] = "female" })[try(UnitSex, "player") or 0]
  s.money = clean(try(GetMoney)) -- in copper
  s.xp = clean(try(UnitXP, "player"))
  s.xpMax = clean(try(UnitXPMax, "player"))
  s.restedXP = clean(try(GetXPExhaustion))
end

local function location(s)
  local loc = {}
  loc.zone = clean(try(GetRealZoneText)) or clean(try(GetZoneText))
  loc.subzone = clean(try(GetSubZoneText))
  loc.inInstance = clean((try(IsInInstance)))
  if C_Map and C_Map.GetBestMapForUnit then
    local mapID = try(C_Map.GetBestMapForUnit, "player")
    if mapID then
      loc.mapID = clean(mapID)
      local info = try(C_Map.GetMapInfo, mapID)
      if type(info) == "table" then loc.mapName = clean(info.name) end
      local pos = try(C_Map.GetPlayerMapPosition, mapID, "player")
      if pos and pos.GetXY then
        local x, y = pos:GetXY()
        loc.x = round(clean(x) and x * 100, 1)
        loc.y = round(clean(y) and y * 100, 1)
      end
    end
  end
  s.location = loc
end

local function talents(s)
  local trees = {}
  local numTabs = try(GetNumTalentTabs) or 0
  for tab = 1, numTabs do
    local tree = { talents = {}, spent = 0 }
    -- GetTalentTabInfo has changed shape between versions, so take the
    -- first string it returns as the tree name.
    local r = { try(GetTalentTabInfo, tab) }
    for _, v in ipairs(r) do
      if type(v) == "string" and not tree.name and not v:match("^Interface") then
        tree.name = clean(v)
      end
    end
    local n = try(GetNumTalents, tab) or 0
    for i = 1, n do
      local name, _, tier, column, rank, maxRank = try(GetTalentInfo, tab, i)
      if name then
        rank = tonumber(rank) or 0
        tree.spent = tree.spent + rank
        table.insert(tree.talents, {
          name = clean(name), tier = clean(tier), column = clean(column),
          rank = rank, maxRank = clean(maxRank),
        })
      end
    end
    table.insert(trees, tree)
  end
  s.talents = trees
  s.unspentTalentPoints = clean(try(UnitCharacterPoints, "player"))
    or clean(try(GetUnspentTalentPoints))
end

local SLOTS = {
  [1] = "Head", [2] = "Neck", [3] = "Shoulder", [4] = "Shirt", [5] = "Chest",
  [6] = "Waist", [7] = "Legs", [8] = "Feet", [9] = "Wrist", [10] = "Hands",
  [11] = "Finger 1", [12] = "Finger 2", [13] = "Trinket 1", [14] = "Trinket 2",
  [15] = "Back", [16] = "Main hand", [17] = "Off hand", [18] = "Ranged",
  [19] = "Tabard",
}

local function gear(s)
  local g = {}
  for slot = 1, 19 do
    local link = try(GetInventoryItemLink, "player", slot)
    if link then
      local name, quality = itemName(link)
      table.insert(g, {
        slot = SLOTS[slot], name = name, quality = quality,
        itemID = itemIdFromLink(link),
      })
    end
  end
  s.gear = g
end

local function bags(s)
  local byId, out = {}, {}
  for bag = 0, 4 do
    local slots = 0
    if C_Container and C_Container.GetContainerNumSlots then
      slots = try(C_Container.GetContainerNumSlots, bag) or 0
    elseif GetContainerNumSlots then
      slots = try(GetContainerNumSlots, bag) or 0
    end
    for slot = 1, slots do
      local link, count
      if C_Container and C_Container.GetContainerItemInfo then
        local info = try(C_Container.GetContainerItemInfo, bag, slot)
        if type(info) == "table" then link, count = info.hyperlink, info.stackCount end
      elseif GetContainerItemInfo then
        local _, c, _, _, _, _, l = try(GetContainerItemInfo, bag, slot)
        link, count = l, c
      end
      local id = itemIdFromLink(link)
      if id then
        if not byId[id] then
          local name, quality = itemName(link)
          byId[id] = { itemID = id, name = name, quality = quality, count = 0 }
          table.insert(out, byId[id])
        end
        byId[id].count = byId[id].count + (tonumber(count) or 1)
      end
    end
  end
  s.bags = out
  s.freeBagSlots = 0
  for bag = 0, 4 do
    local free
    if C_Container and C_Container.GetContainerNumFreeSlots then
      free = try(C_Container.GetContainerNumFreeSlots, bag)
    elseif GetContainerNumFreeSlots then
      free = try(GetContainerNumFreeSlots, bag)
    end
    s.freeBagSlots = s.freeBagSlots + (tonumber(free) or 0)
  end
end

local function skills(s)
  local list = {}
  -- Classic-style skill list (professions, weapon skills, riding, languages)
  local n = try(GetNumSkillLines) or 0
  for i = 1, n do
    local name, isHeader, _, rank, _, _, maxRank = try(GetSkillLineInfo, i)
    if name and not isHeader then
      table.insert(list, { name = clean(name), rank = clean(rank), maxRank = clean(maxRank) })
    end
  end
  -- Modern profession API, if the skill list was empty
  if #list == 0 and GetProfessions then
    local profs = { try(GetProfessions) }
    for _, idx in pairs(profs) do
      if idx then
        local name, _, rank, maxRank = try(GetProfessionInfo, idx)
        if name then
          table.insert(list, { name = clean(name), rank = clean(rank), maxRank = clean(maxRank) })
        end
      end
    end
  end
  s.skills = list
end

local function spells(s)
  local seen, out = {}, {}
  local function add(name, sub)
    name, sub = clean(name), clean(sub)
    if not name then return end
    local entry = seen[name]
    if not entry then
      entry = { name = name }
      seen[name] = entry
      table.insert(out, entry)
    end
    if sub and sub ~= "" then
      local r = tonumber(sub:match("(%d+)"))
      if r and (not entry.rank or r > entry.rank) then entry.rank = r end
    end
  end

  if C_SpellBook and C_SpellBook.GetNumSpellBookSkillLines then
    local bank = Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Player or 0
    local lines = try(C_SpellBook.GetNumSpellBookSkillLines) or 0
    for l = 1, lines do
      local info = try(C_SpellBook.GetSpellBookSkillLineInfo, l)
      if type(info) == "table" and not info.shouldHide then
        local offset, count = info.itemIndexOffset or 0, info.numSpellBookItems or 0
        for i = offset + 1, offset + count do
          local name, sub = try(C_SpellBook.GetSpellBookItemName, i, bank)
          add(name, sub)
        end
      end
    end
  elseif GetNumSpellTabs then
    for tab = 1, (try(GetNumSpellTabs) or 0) do
      local _, _, offset, count = try(GetSpellTabInfo, tab)
      for i = (offset or 0) + 1, (offset or 0) + (count or 0) do
        add(try(GetSpellBookItemName, i, BOOKTYPE_SPELL or "spell"))
      end
    end
  end
  s.spells = out

  local riding = false
  for _, sp in ipairs(out) do
    if sp.name:find("Riding") then riding = true end
  end
  for _, sk in ipairs(s.skills or {}) do
    if sk.name and sk.name:find("Riding") then riding = true end
  end
  s.knowsRiding = riding
end

local function reputations(s)
  local out = {}
  local function label(reaction)
    return clean(_G["FACTION_STANDING_LABEL" .. tostring(reaction or "")]) or reaction
  end
  if C_Reputation and C_Reputation.GetNumFactions and C_Reputation.GetFactionDataByIndex then
    for i = 1, (try(C_Reputation.GetNumFactions) or 0) do
      local d = try(C_Reputation.GetFactionDataByIndex, i)
      if type(d) == "table" and d.name and not d.isHeader then
        table.insert(out, { name = clean(d.name), standing = label(d.reaction) })
      end
    end
  elseif GetNumFactions then
    for i = 1, (try(GetNumFactions) or 0) do
      local name, _, standingID, _, _, _, _, _, isHeader = try(GetFactionInfo, i)
      if name and not isHeader then
        table.insert(out, { name = clean(name), standing = label(standingID) })
      end
    end
  end
  s.reputations = out
end

-- Quest markers. Forever's UI is modern but its quest data is Classic-style,
-- so try three sources and record which one answered.
local mapPins = {}

local function mapChain()
  local chain = {}
  if not (C_Map and C_Map.GetBestMapForUnit) then return chain end
  local id = try(C_Map.GetBestMapForUnit, "player")
  for _ = 1, 4 do
    if not id or id == 0 then break end
    table.insert(chain, id)
    local info = try(C_Map.GetMapInfo, id)
    id = type(info) == "table" and info.parentMapID or nil
  end
  return chain
end

local function collectMapPins()
  mapPins = {}
  if not (C_QuestLog and C_QuestLog.GetQuestsOnMap) then return end
  for _, mapID in ipairs(mapChain()) do
    local pins = try(C_QuestLog.GetQuestsOnMap, mapID)
    if type(pins) == "table" then
      for _, p in ipairs(pins) do
        if p.questID and p.x and p.y and not mapPins[p.questID] then
          mapPins[p.questID] = { mapID = mapID, x = p.x, y = p.y }
        end
      end
    end
  end
end

local function pin(mapID, x, y, source)
  if not (mapID and x and y) then return nil end
  local info = try(C_Map.GetMapInfo, mapID)
  return {
    mapID = clean(mapID),
    mapName = type(info) == "table" and clean(info.name) or nil,
    x = round(clean(x) and x * 100, 1), y = round(clean(y) and y * 100, 1),
    source = source,
  }
end

local function questLocation(questID)
  if C_QuestLog and C_QuestLog.GetNextWaypoint then
    local mapID, x, y = try(C_QuestLog.GetNextWaypoint, questID)
    local p = pin(mapID, x, y, "waypoint")
    if p then return p end
  end
  local m = mapPins[questID]
  if m then return pin(m.mapID, m.x, m.y, "map pin") end
  if QuestPOIGetIconInfo then
    local _, x, y = try(QuestPOIGetIconInfo, questID)
    local chain = mapChain()
    local p = pin(chain[1], x, y, "poi")
    if p then return p end
  end
  return nil
end

local function quests(s)
  local out = {}
  pcall(collectMapPins)
  if C_QuestLog and C_QuestLog.GetNumQuestLogEntries and C_QuestLog.GetInfo then
    local previous = try(C_QuestLog.GetSelectedQuest)
    local header
    for i = 1, (try(C_QuestLog.GetNumQuestLogEntries) or 0) do
      local info = try(C_QuestLog.GetInfo, i)
      if type(info) == "table" then
        if info.isHeader then
          header = clean(info.title)
        elseif info.questID and not info.isHidden then
          local q = {
            questID = clean(info.questID), title = clean(info.title),
            level = clean(info.level), zoneHeader = header,
            complete = (try(C_QuestLog.IsComplete, info.questID)) and true or false,
            objectives = {},
          }
          local objs = try(C_QuestLog.GetQuestObjectives, info.questID)
          if type(objs) == "table" then
            for _, o in ipairs(objs) do
              table.insert(q.objectives, { text = clean(o.text), finished = clean(o.finished) })
            end
          end
          if C_QuestLog.SetSelectedQuest and GetQuestLogQuestText then
            try(C_QuestLog.SetSelectedQuest, info.questID)
            local desc, objText = try(GetQuestLogQuestText)
            q.description = clean(desc)
            q.objectiveText = clean(objText)
          end
          q.waypoint = questLocation(info.questID)
          table.insert(out, q)
        end
      end
    end
    if previous and C_QuestLog.SetSelectedQuest then try(C_QuestLog.SetSelectedQuest, previous) end
  elseif GetNumQuestLogEntries then
    local previous = try(GetQuestLogSelection)
    local header
    for i = 1, (try(GetNumQuestLogEntries) or 0) do
      local title, level, _, isHeader, _, isComplete, _, questID = try(GetQuestLogTitle, i)
      if isHeader then
        header = clean(title)
      elseif title then
        local q = {
          questID = clean(questID), title = clean(title), level = clean(level),
          zoneHeader = header, complete = isComplete == 1 or isComplete == true,
          objectives = {},
        }
        try(SelectQuestLogEntry, i)
        local desc, objText = try(GetQuestLogQuestText)
        q.description, q.objectiveText = clean(desc), clean(objText)
        for o = 1, (try(GetNumQuestLeaderBoards, i) or 0) do
          local text, _, finished = try(GetQuestLogLeaderBoard, o, i)
          table.insert(q.objectives, { text = clean(text), finished = clean(finished) })
        end
        table.insert(out, q)
      end
    end
    if previous then try(SelectQuestLogEntry, previous) end
  end
  s.quests = out
end

local function apiCheck(s)
  local a = {}
  a.GetNumTalentTabs = GetNumTalentTabs and (try(GetNumTalentTabs) or "error") or "missing"
  a.GetTalentInfo = GetTalentInfo and "present" or "missing"
  a.C_ClassTalents = C_ClassTalents and "present" or "missing"
  a.C_Traits = C_Traits and "present" or "missing"
  a.UnitCharacterPoints = UnitCharacterPoints and tostring(try(UnitCharacterPoints, "player")) or "missing"
  a.GetNumSkillLines = GetNumSkillLines and (try(GetNumSkillLines) or "error") or "missing"
  a.GetNextWaypoint = (C_QuestLog and C_QuestLog.GetNextWaypoint) and "present" or "missing"
  a.GetQuestsOnMap = (C_QuestLog and C_QuestLog.GetQuestsOnMap) and "present" or "missing"
  a.QuestPOIGetIconInfo = QuestPOIGetIconInfo and "present" or "missing"
  local pins = 0
  for _ in pairs(mapPins) do pins = pins + 1 end
  a.mapPinsFound = pins
  local client = { try(GetBuildInfo) }
  a.clientVersion = clean(client[1])
  a.interface = clean(client[4])
  s.api = a
end

-- ---------------------------------------------------------------------------
-- Places this character has been. Hints only name places on this list.
-- ---------------------------------------------------------------------------

local function recordVisit()
  local key = charKey()
  ForeverCompanionDB.visited = ForeverCompanionDB.visited or {}
  local v = ForeverCompanionDB.visited[key] or { zones = {}, subzones = {} }
  ForeverCompanionDB.visited[key] = v
  local zone = clean(try(GetRealZoneText)) or clean(try(GetZoneText))
  local sub = clean(try(GetSubZoneText))
  if zone and zone ~= "" then v.zones[zone] = true end
  if zone and sub and sub ~= "" then v.subzones[zone .. " / " .. sub] = true end
end

-- ---------------------------------------------------------------------------
-- Take the snapshot
-- ---------------------------------------------------------------------------

local lastSnapshot = 0

local function snapshot(reason, force)
  -- Never read anything during combat.
  if InCombatLockdown and InCombatLockdown() then return false end
  local now = time()
  if not force and now - lastSnapshot < 20 then return false end
  lastSnapshot = now

  local s = { addonVersion = VERSION, savedAt = now, reason = reason }
  for _, section in ipairs({ basics, location, talents, gear, bags, skills, spells, reputations, quests, apiCheck }) do
    local ok = pcall(section, s)
    if not ok then s.partial = true end
  end
  if not s.name then return false end

  ForeverCompanionDB.version = 1
  ForeverCompanionDB.characters = ForeverCompanionDB.characters or {}
  ForeverCompanionDB.characters[charKey()] = s
  return true
end

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("PLAYER_LEVEL_UP")
frame:RegisterEvent("PLAYER_REGEN_ENABLED")
frame:RegisterEvent("ZONE_CHANGED")
frame:RegisterEvent("ZONE_CHANGED_NEW_AREA")
frame:RegisterEvent("QUEST_TURNED_IN")
frame:RegisterEvent("QUEST_ACCEPTED")
frame:RegisterEvent("PLAYER_LOGOUT")

frame:SetScript("OnEvent", function(_, event)
  if event == "ZONE_CHANGED" or event == "ZONE_CHANGED_NEW_AREA" or event == "PLAYER_ENTERING_WORLD" then
    pcall(recordVisit)
  end
  if event == "PLAYER_ENTERING_WORLD" and ForeverCompanionDB.pendingMessages then
    local lines = ForeverCompanionDB.pendingMessages
    ForeverCompanionDB.pendingMessages = nil
    local function show() for _, l in ipairs(lines) do print(l) end end
    if C_Timer then C_Timer.After(1, show) else show() end
  end
  if event == "PLAYER_LOGOUT" then
    snapshot("logout", true)
  elseif event == "PLAYER_LEVEL_UP" then
    -- Level and talent points update a moment after the event fires.
    if C_Timer then C_Timer.After(2, function() snapshot("level up", true) end) end
  else
    snapshot(event:lower())
  end
end)

-- Refresh quietly every couple of minutes while out of combat, so a crash
-- or Alt+F4 still leaves a recent snapshot from the last /reload.
if C_Timer and C_Timer.NewTicker then
  C_Timer.NewTicker(120, function() snapshot("timer") end)
end

-- ---------------------------------------------------------------------------
-- /ding — your next talent, right here in chat
-- ---------------------------------------------------------------------------

local C = "|cff9fd3ff"   -- soft blue: the companion's voice
local T = "|cffffd100"   -- gold: the talent name
local Q = "|cffa0a0a0"   -- grey: quiet detail
local R = "|r"

-- While /ding is preparing, lines are held so they can be shown after the reload.
local buffer
local function out(text)
  if buffer then table.insert(buffer, text) else print(text) end
end
local function say(msg) out(C .. "Companion:" .. R .. " " .. msg) end

-- Save, reload, then show these lines once the loading screen ends.
local function reloadWith(lines)
  ForeverCompanionDB.pendingMessages = lines
  snapshot("sync", true)
  ReloadUI()
end

-- Ranks currently spent, by talent name. Empty if the talent API isn't available.
local function currentRanks()
  local ranks, found = {}, false
  for tab = 1, (try(GetNumTalentTabs) or 0) do
    for i = 1, (try(GetNumTalents, tab) or 0) do
      local name, _, _, _, rank = try(GetTalentInfo, tab, i)
      if name then
        ranks[name] = tonumber(rank) or 0
        found = true
      end
    end
  end
  return found and ranks or nil
end

-- The plan points still to take, in order.
local function remainingPoints(plan, ranks, level)
  local out, counted = {}, {}
  for idx, p in ipairs(plan.points) do
    counted[p.talent] = (counted[p.talent] or 0) + 1
    local done
    if ranks then
      done = (ranks[p.talent] or 0) >= counted[p.talent]
    else
      done = p.level < level -- no talent data: assume earlier levels are spent
    end
    if not done then table.insert(out, p) end
  end
  return out
end

local function ding()
  if InCombatLockdown and InCombatLockdown() then
    say("Finish the fight first, then /ding again.")
    return
  end
  buffer = {}
  local name = UnitName("player")
  local plan = ForeverCompanion_Plans and ForeverCompanion_Plans[name]
  local level = UnitLevel("player") or 0
  snapshot("ding", true)

  if not plan then
    say("No talent plan for " .. tostring(name) .. " yet. Ask Claude to set one up.")
    local lines = buffer
    buffer = nil
    reloadWith(lines)
    return
  end

  local ranks = currentRanks()
  local unspent = tonumber(try(UnitCharacterPoints, "player") or try(GetUnspentTalentPoints)) or 0
  local todo = remainingPoints(plan, ranks, level)

  out(" ")
  say("Ding! Level " .. level .. ".")

  if #todo == 0 then
    say("Your build is complete.")
  elseif level < 10 then
    say("Talents start at level 10. First up: " .. T .. todo[1].talent .. R .. ".")
  elseif ranks and unspent == 0 then
    local nxt = todo[1]
    if nxt.level <= level then
      say("No points to spend right now. Your next one goes into " .. T .. nxt.talent .. R .. ".")
    else
      say("No points to spend right now. Next is " .. T .. nxt.talent .. R .. Q .. " at level " .. nxt.level .. R .. ".")
    end
  else
    local count = ranks and math.max(unspent, 1) or 1
    for i = 1, math.min(count, #todo, 3) do
      local p = todo[i]
      say("Take " .. T .. p.talent .. R .. Q .. " (" .. p.tree .. ", " .. p.rank .. "/" .. p.of .. ")" .. R)
      if p.why and p.why ~= "" and (i == 1 or p.talent ~= todo[i - 1].talent) then
        out("   " .. Q .. p.why .. R)
      end
    end
    if count > 3 then say(Q .. "...and " .. (count - 3) .. " more. Ask Claude for the rest." .. R) end
    if not ranks then say(Q .. "Couldn't read your talents, so this assumes you're on plan." .. R) end
  end

  -- Gold goals coming up, such as riding at 40.
  local snap = ForeverCompanionDB.characters and ForeverCompanionDB.characters[charKey()]
  local money = (try(GetMoney) or 0) / 10000
  for _, g in ipairs(plan.goals or {}) do
    local skip = g.riding and snap and snap.knowsRiding
    if not skip and g.level then
      if level >= g.level then
        say(T .. g.name .. R .. " is available now. Visit the trainer.")
      elseif g.level - level <= 5 then
        local away = g.level - level
        local line = g.name .. " at level " .. g.level .. ", " .. away .. (away == 1 and " level" or " levels") .. " away"
        if g.gold then line = line .. Q .. string.format(" (about %dg needed, %dg saved)", g.gold, math.floor(money)) .. R end
        say(line .. ".")
      end
    end
  end

  say(Q .. "Claude can see this now too." .. R)
  local lines = buffer
  buffer = nil
  reloadWith(lines)
end

local function sync()
  if InCombatLockdown and InCombatLockdown() then
    say("Finish the fight first, then /sync again.")
    return
  end
  reloadWith({ C .. "Companion:" .. R .. " Synced. Claude can see " .. tostring(UnitName("player")) .. " as of now." })
end

-- For the key bindings (Options > Keybindings > AddOns > Forever Companion).
ForeverCompanion_Ding = ding
ForeverCompanion_Sync = sync
BINDING_HEADER_FOREVERCOMPANION = "Forever Companion"
BINDING_NAME_FOREVERCOMPANION_DING = "Ding: next talent (reloads)"
BINDING_NAME_FOREVERCOMPANION_SYNC = "Sync with Claude (reloads)"

SLASH_FOREVERCOMPANIONSYNC1 = "/sync"
SLASH_FOREVERCOMPANIONSYNC2 = "/fcsync"
SlashCmdList.FOREVERCOMPANIONSYNC = sync

SLASH_FOREVERCOMPANIONDING1 = "/ding"
SlashCmdList.FOREVERCOMPANIONDING = ding

-- ---------------------------------------------------------------------------
-- /companion
-- ---------------------------------------------------------------------------

SLASH_FOREVERCOMPANION1 = "/companion"
SLASH_FOREVERCOMPANION2 = "/fcomp"
SlashCmdList.FOREVERCOMPANION = function()
  if snapshot("manual", true) then
    print("|cff9fd3ffForever Companion:|r snapshot taken. Type /reload (or log out) so the game saves it for Claude.")
  else
    print("|cff9fd3ffForever Companion:|r can't take a snapshot in combat. Try again once you're out of combat.")
  end
end
