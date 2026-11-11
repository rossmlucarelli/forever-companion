# Simulates Forever's live client: newer talent system, and a logout that has
# already cleared gear, bags, money and quest details.
import lupa, sys
L = lupa.LuaRuntime()
mock = open('test/mock_wow.lua').read()
mock = mock.replace("function GetNumTalentTabs() return 2 end", "")
mock = mock.replace("function UnitCharacterPoints() return 2 end", "")
mock = mock.replace("function UnitLevel() return 37 end", "function UnitLevel() return 10 end")
extra = '''
LOGGED_OUT = false
C_ClassTalents = { GetActiveConfigID = function() return 77 end }
local defs = { [1] = "Power in Light", [2] = "Twin Disciplines", [3] = "Holy Specialization" }
C_Traits = {
  GetConfigInfo = function() return { treeIDs = { 900 } } end,
  GetTreeCurrencyInfo = function() return { { quantity = 1 } } end,
  GetTreeNodes = function() return { 1, 2, 3 } end,
  GetNodeInfo = function(_, id) return { isVisible = true, currentRank = 0, maxRanks = 5, entryIDs = { id } } end,
  GetEntryInfo = function(_, id) return { definitionID = id } end,
  GetDefinitionInfo = function(id) return { spellID = 1000 + id } end,
}
C_DateAndTime = { GetCurrentCalendarTime = function() return { year = 2026, month = 11, monthDay = 11, hour = 2, minute = 30 } end }
C_Calendar = {
  SetAbsMonth = function() end, OpenCalendar = function() end,
  GetMonthInfo = function() return { numDays = 30 } end,
  GetNumDayEvents = function(mo, d) if mo == 0 and d == 13 then return 1 end return 0 end,
  GetDayEvent = function() return { title = "Darkmoon Faire", calendarType = "HOLIDAY",
    startTime = { year = 2026, month = 11, monthDay = 13, hour = 0, minute = 1 }, endTime = { year = 2026, month = 11, monthDay = 19, hour = 23, minute = 59 } } end,
}
local realComplete = C_QuestLog.IsComplete
C_QuestLog.IsComplete = function(...) if LOGGED_OUT then return false end return true end
C_Spell = { GetSpellName = function(id) return defs[id - 1000] end }
function GetBuildInfo() return "1.60.1", "1", "", 16001 end
local realLink, realMoney, realInfo = GetInventoryItemLink, GetMoney, C_QuestLog.GetInfo
GetInventoryItemLink = function(...) if LOGGED_OUT then return nil end return realLink(...) end
GetMoney = function() if LOGGED_OUT then return 0 end return realMoney() end
C_Container.GetContainerNumSlots = function(b) if LOGGED_OUT then return 0 end return b == 0 and 2 or 0 end
C_QuestLog.GetInfo = function(i) local q = realInfo(i) if LOGGED_OUT and q and not q.isHeader then q.level = 0 end return q end
local realText = GetQuestLogQuestText
GetQuestLogQuestText = function() if LOGGED_OUT then return nil end return realText() end
'''
mock = mock.replace('return handlers', extra + '\nreturn handlers')
h = L.execute(mock)
L.execute(open(sys.argv[1]).read())
L.execute(open('addon/ForeverCompanion/ForeverCompanion.lua').read())
L.globals().ReloadUI = lambda: h.event(None, "PLAYER_ENTERING_WORLD")
h.event(None, "PLAYER_ENTERING_WORLD")
g = L.globals()
snap = lambda: list(g.ForeverCompanionDB.characters.values())[0]
s = snap()
print("live:   gold", s.money, "| gear", len(s.gear), "| talents", [t.name for t in s.talents[1].talents.values()], "| unspent", s.unspentTalentPoints)
g.LOGGED_OUT = True
h.event(None, "PLAYER_LOGOUT")
s = snap()
q = list(s.quests.values())[0]
print("logout: gold", s.money, "| gear", len(s.gear), "| bags", len(s.bags), "| kept", list(s.kept.values()) if s.kept else None, "| quest level", q.level, "| has text", bool(q.description))
print("traits check:", dict(s.api.traits))
g.LOGGED_OUT = False
print("\n/ding at level 10 with the newer talent system:")
g.SlashCmdList.FOREVERCOMPANIONDING()

print("events:", [dict(e) for e in snap().events.values()])
q = list(snap().quests.values())[0]
print("quest still ready to hand in after logout:", q.complete)
print("\nserver restart warning:")
g.ForeverCompanionDB.characters = None
h.event(None, "CHAT_MSG_SYSTEM", "Server restart in 15:00")
print("saved on warning:", snap().reason)
h.event(None, "CHAT_MSG_SYSTEM", "Guild message of the day: hello")
