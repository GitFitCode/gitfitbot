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
 * Listen to `ready` event from discord.
 */
client.once('ready', () => {
  console.log('Ready!');
});

/**
 * Listen to `interactionCreate` event from discord.
 */
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

/**
 * Login to Discord with our OAuth client's token.
 */
client.login(process.env.TOKEN);
