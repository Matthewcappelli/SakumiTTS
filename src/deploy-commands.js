import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID.");
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

const scope = DISCORD_GUILD_ID ? `guild ${DISCORD_GUILD_ID}` : "global";

console.log(`Deploying ${commands.length} slash commands to ${scope}...`);
await rest.put(route, { body: commands });
console.log("Slash commands deployed.");
