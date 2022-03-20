const fs = require('node:fs');
const { Collection } = require('discord.js');

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

module.exports = {
	name: 'messageCreate',
	once: false,
	execute(message) {
		if (!message.author.bot && message.channel.name === 'slasherbot') {
			const args = message.content.split(' ');

			if (args.length == 0 || args[0].charAt(0) !== '!') return;

			const command = args.shift().substr(1);
			const rCommands = generateRawCommands();

			const commandMatch = rCommands.get(command);
			if (commandMatch) commandMatch(message);
		}
	},
};