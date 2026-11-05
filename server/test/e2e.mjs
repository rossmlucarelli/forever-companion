// End to end against a built bundle: node server/test/e2e.mjs <bundle> <fake wow dir> <data dir>
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const [bundle, wow, data] = process.argv.slice(2);
const t = new StdioClientTransport({ command: "node", args: [bundle], env: { ...process.env, FC_WOW_DIR: wow, FC_DATA_DIR: data, FC_USE_WIKI: "false" } });
const c = new Client({ name: "e2e", version: "1" });
await c.connect(t);
const call = async (name, args = {}) => JSON.parse((await c.callTool({ name, arguments: args })).content[0].text);
const show = (label, v) => console.log(`\n== ${label}\n${JSON.stringify(v, null, 1).slice(0, 900)}`);
const addon = path.join(wow, "_forever_", "Interface", "AddOns", "ForeverCompanion");
console.log("addon installed:", fs.existsSync(path.join(addon, "ForeverCompanion.toc")), fs.readdirSync(addon).join(", "));
const ch = await call("get_character");
show("get_character (new player, new character)", { notices: ch.notices, setup: ch.setup, name: ch.name, level: ch.level });
show("build progress before plan", await call("get_build_progress"));
show("bad link", await call("set_talent_plan", { character: "Arkin", link: "https://www.icy-veins.com/wow-forever/mage-talent-calculator#tc-0" }));
const plan = await call("set_talent_plan", {
  character: "Arkin",
  link: "https://www.icy-veins.com/wow-forever/priest-talent-calculator#tc-000002222244455555777999daaaekkkkkmmmmmfffffggghppp",
  reasons: { Penance: "Your bread and butter." },
});
show("set_talent_plan", { build: plan.build, first: plan.levels.slice(0, 3), missing: plan.reasons_missing?.length, in_game: plan.in_game });
show("build progress after plan", await call("get_build_progress"));
const st = await call("companion_status");
show("status", { version: st.connector_version, addon: st.addon, updates: st.updates });
await c.close();
