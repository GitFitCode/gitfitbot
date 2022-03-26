require('dotenv').config();
const fs = require('fs');
const { Client, Collection, Intents } = require('discord.js');

/**
 * An instance of `Client`.
 */
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
client.commands = new Collection();

/**
 * List of files corresponding to the slash (i.e. custom) commands supported by the bot.
 */
const commandFiles = fs.readdirSync('./slash-commands').filter(file => file.endsWith('.js'));

/**
 * Store the command name and the command execution function in `client.commands`.
 */
for (const file of commandFiles) {
	const command = require(`./slash-commands/${file}`);
	client.commands.set(command.data.name, command);
}

/**
 * List of files corresponding to events subscribed by the bot.
 */
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

/**
 * Add events to `client` for subscription and listen to them in their respective execute() functions.
 */
for (const file of eventFiles) {
	const event = require(`./events/${file}`);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	}
	else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

/**
 * Login to Discord with our OAuth client's token.
 */
client.login(process.env.TOKEN);
