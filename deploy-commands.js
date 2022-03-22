/**
 * Register and update the slash (i.e. custom) commands for the bot.
 */

require('dotenv').config();
const fs = require('node:fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

/**
 * Slash commands list.
 */
const slashCommands = [];

/**
 * List of files corresponding to the slash commands supported by the bot.
 */
const commandFiles = fs.readdirSync('./slash-commands').filter(file => file.endsWith('.js'));

/**
 * Populate `commands` with the `data` and `description` from the supported slash commands.
 */
for (const file of commandFiles) {
	const command = require(`./slash-commands/${file}`);
	slashCommands.push(command.data.toJSON());
}

/**
 * Follow the guide here - https://discord.js.org/#/docs/discord.js/stable/general/welcome - to ensure that your slash commands are registered properly.
 */
const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);

rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: slashCommands })
	.then(() => console.log('Successfully registered application slash (i.e. custom) commands.'))
	.catch(console.error);
