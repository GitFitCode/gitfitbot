/**
 * Entrypoint for the bot.
 */

import { Client, GatewayIntentBits } from "discord.js";
import interactionCreate from "./listeners/interactionCreate";
import ready from "./listeners/ready";
require("dotenv").config();

console.log("Bot is starting...");

// A new instance of `Client`.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: ["roles"] },
});

// Register the client with the ready listener.
ready(client);
// Register the client with the interactionCreate listener.
interactionCreate(client);

// Call login on client for authenticating the bot with Discord.
client.login(process.env.DISCORD_TOKEN);

let test = "";
