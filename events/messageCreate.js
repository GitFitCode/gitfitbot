/**
 * Listen to `messageCreate` event from discord.
 */

const fs = require('node:fs');
const { Collection } = require('discord.js');

/**
 * Function to read files correspoing to the raw commands (i.e. commands beginning with `!`) supported by the bot.
 * @returns {Collection} rawCommands.
 */
const generateRawCommands = () => {
	const rawCommandFiles = fs.readdirSync('./raw-commands').filter(file => file.endsWith('.js'));
	const rawCommands = new Collection();
	for (const file of rawCommandFiles) {
		const rawCommand = require(`../raw-commands/${file}`);
		const fileName = file.replace('.js', '');
		rawCommands.set(fileName, rawCommand);
	}
	return rawCommands;
};

/**
 * https://discord.js.org/#/docs/main/stable/class/Message
 *
 * Function to parse the created message.
 * @param {Message} message
 */
function parseMessage(message) {

	/**
	 * Is the message creator a bot?
	 */
	const isBot = message.author.bot;

	/**
	 * Name of the discord channel where this message was created.
	 */
	const channelName = message.channel.name;

	/**
	 * Execute if the message was created in `slasherbot` channel AND the creator is not a bot.
	 */
	if (!isBot && channelName === 'slasherbot') {
		const args = message.content.split(' ');

		if (args.length == 0 || args[0].charAt(0) !== '!') return;

		const command = args.shift().substr(1);
		const rCommands = generateRawCommands();

		const commandMatch = rCommands.get(command);
		if (commandMatch) commandMatch(message);
	}
}

module.exports = {
	name: 'messageCreate',
	once: false,
	execute(message) {
		parseMessage(message);
	},
};
