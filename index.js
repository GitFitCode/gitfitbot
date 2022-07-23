require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");

/**
 * An instance of `Client`.
 */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * List of files corresponding to the slash commands supported by the bot.
 */
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

/**
 * Store the command name and the command execution function in `client.commands`.
 */
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

/**
 * List of files corresponding to events subscribed by the bot.
 */
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

/**
 * Add events to `client` for subscription and listen to them in their respective execute() functions.
 */
for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

/**
 * Login to Discord with our OAuth client's token.
 */
client.login(process.env.TOKEN);
