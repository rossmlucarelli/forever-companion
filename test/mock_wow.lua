-- Minimal fake WoW API (modern-style) for testing the addon outside the game.
local handlers = {}
function CreateFrame() local f = {} function f:RegisterEvent() end function f:SetScript(_, fn) handlers.event = fn end return f end
C_Timer = { After = function(_, fn) fn() end, NewTicker = function() end }
SlashCmdList = {}
function InCombatLockdown() return false end
function UnitName() return "Arkin" end
function GetRealmName() return "Forever" end
function UnitLevel() return 37 end
function UnitClass() return "Priest", "PRIEST" end
function UnitRace() return "Gnome" end
function UnitFactionGroup() return "Alliance" end
function UnitSex() return 2 end
function GetMoney() return 812345 end
function UnitXP() return 4000 end
function UnitXPMax() return 10000 end
function GetXPExhaustion() return 1200 end
function GetRealZoneText() return "Wetlands" end
function GetSubZoneText() return "Menethil Harbor" end
function IsInInstance() return false end
C_Map = {
  GetBestMapForUnit = function() return 1437 end,
  GetMapInfo = function(id) return { name = "Wetlands" } end,
  GetPlayerMapPosition = function() return { GetXY = function() return 0.101, 0.592 end } end,
}
function GetNumTalentTabs() return 2 end
function GetTalentTabInfo(t) return t, ({"Discipline","Holy"})[t], "desc", "Interface\\icon", 0 end
local tal = {
  {{"Power in Light",5,5},{"Twin Disciplines",5,5},{"Holy Precision",3,3},{"Mental Strength",5,5},{"Mental Agility",3,3},{"Improved Power Word: Shield",3,3},{"Soul Warding",1,1},{"Meditation",3,0},{"Penance",1,0},{"Inner Focus",1,0}},
  {{"Holy Specialization",0,5},{"Divine Fury",0,5}},
}
function GetNumTalents(t) return #tal[t] end
function GetTalentInfo(t,i) local x = tal[t][i] return x[1], "icon", i, 1, x[2], x[3] end
function UnitCharacterPoints() return 2 end
function GetInventoryItemLink(_, slot) if slot == 5 then return "|cff1eff00|Hitem:9999::|h[Robe of the \"Moon\"]|h|r" end end
C_Item = { GetItemInfo = function(l) local n = type(l)=="string" and l:match("%[(.-)%]") return n, l, 2 end }
C_Container = {
  GetContainerNumSlots = function(b) return b == 0 and 2 or 0 end,
  GetContainerItemInfo = function(b, s) return { hyperlink = "|Hitem:2770::|h[Copper Ore]|h", stackCount = 10 } end,
  GetContainerNumFreeSlots = function(b) return b == 0 and 3 or 0 end,
}
function GetNumSkillLines() return 3 end
function GetSkillLineInfo(i) return ({{"Professions",true},{"Mining",false,false,112,0,0,150},{"Engineering",false,false,98,0,0,150}})[i][1], ({{"x",true},{"x",false},{"x",false}})[i][2], false, ({0,112,98})[i], 0, 0, ({0,150,150})[i] end
Enum = { SpellBookSpellBank = { Player = 0 } }
C_SpellBook = {
  GetNumSpellBookSkillLines = function() return 1 end,
  GetSpellBookSkillLineInfo = function() return { itemIndexOffset = 0, numSpellBookItems = 3 } end,
  GetSpellBookItemName = function(i) return ({"Smite","Smite","Power Word: Shield"})[i], ({"Rank 4","Rank 5","Rank 6"})[i] end,
}
FACTION_STANDING_LABEL5 = "Friendly"
C_Reputation = {
  GetNumFactions = function() return 1 end,
  GetFactionDataByIndex = function() return { name = "Gnomeregan", reaction = 5, isHeader = false } end,
}
C_QuestLog = {
  GetSelectedQuest = function() return 0 end,
  SetSelectedQuest = function() end,
  GetNumQuestLogEntries = function() return 2 end,
  GetInfo = function(i) if i == 1 then return { isHeader = true, title = "Wetlands" } end return { questID = 288, title = "The Third Fleet", level = 30 } end,
  IsComplete = function() return false end,
  GetQuestObjectives = function() return { { text = "Find the cache", finished = false } } end,
  GetNextWaypoint = function() return 1437, 0.134, 0.412 end,
}
function GetQuestLogQuestText() return "The fleet's lost cache lies somewhere along the coast.\nAsk the dwarves at the docks.", "Find the cache." end
time = os.time
function print(...) io.write(table.concat({...}, " "), "\n") end
return handlers
