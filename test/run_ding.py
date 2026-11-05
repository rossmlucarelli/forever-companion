import lupa
def run(patch, label, cmd="FOREVERCOMPANIONDING"):
    L = lupa.LuaRuntime()
    mock = patch(open('test/mock_wow.lua').read())
    mock = mock.replace("C_Timer = { After = function(_, fn) fn() end, NewTicker = function() end }",
      "C_Timer = { After = function(_, fn) fn() end, NewTicker = function() end }\nfunction GetBuildInfo() return '1.60.1', '99999', 'Nov 4 2026', 16001 end\nC_QuestLog_pins = true")
    h = L.execute(mock)
    L.execute(open('addon/ForeverCompanion/Plan.lua').read())
    L.execute(open('addon/ForeverCompanion/ForeverCompanion.lua').read())
    L.globals().ReloadUI = lambda: (print("   [ reloading… ]"), h.event(None, "PLAYER_ENTERING_WORLD"))
    print(f"\n----- {label}")
    L.globals().SlashCmdList[cmd]()
    db = L.globals().ForeverCompanionDB
    snap = list(db.characters.values())[0]
    return snap
def a(m):
    m = m.replace('function UnitLevel() return 37 end','function UnitLevel() return 38 end')
    m = m.replace('{"Meditation",3,0}','{"Meditation",3,3}').replace('{"Penance",1,0}','{"Penance",0,1}').replace('{"Inner Focus",1,0}','{"Inner Focus",0,1}')
    return m.replace('function UnitCharacterPoints() return 2 end','function UnitCharacterPoints() return 1 end')
snap = run(a, "/ding at 38")
print("api:", dict(snap.api))
q = list(snap.quests.values())[0]
print("quest marker:", dict(q.waypoint) if q.waypoint else None)
# map pins only (no waypoint API)
def pins(m):
    m = a(m).replace("GetNextWaypoint = function() return 1437, 0.134, 0.412 end,",
      "GetQuestsOnMap = function(id) if id == 1437 then return {{questID=288, x=0.5, y=0.25}} end return {} end,")
    return m
snap = run(pins, "/sync with map pins instead of waypoints", "FOREVERCOMPANIONSYNC")
q = list(snap.quests.values())[0]
print("quest marker:", dict(q.waypoint) if q.waypoint else None, "| pins found:", snap.api.mapPinsFound)
