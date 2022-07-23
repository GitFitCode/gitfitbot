/**
 * Register and update the slash commands for the bot.
 */

require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord.js");

/**
 * Slash commands list.
 */
const commands = [];

/**
 * List of files corresponding to the slash commands supported by the bot.
 */
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

/**
 * Populate `commands` with the `data` and `description` from the supported slash commands.
 */
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  commands.push(command.data.toJSON());
}

/**
 * Follow the guide here - https://discord.js.org/#/docs/discord.js/stable/general/welcome - to ensure that your slash commands are registered properly.
 */
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

rest
  .put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    {
      body: commands,
    }
  )
  .then(() => console.log("Successfully registered application commands."))
  .catch(console.error);
