const fs = require('node:fs');
const { Collection } = require('discord.js');

const rawCommandFiles = fs.readdirSync('./raw-commands').filter(file => file.endsWith('.js'));
const rawCommands = new Collection();
for (const file of rawCommandFiles) {
	const rawCommand = require(`../raw-commands/${file}`);
	const fileName = file.replace('.js', '');
	rawCommands.set(fileName, rawCommand);
	// console.log(`file name = ${fileName}`);
}

module.exports = {
	name: 'messageCreate',
	once: false,
	execute(message) {
		console.log(`Message created - ${message}`);
		if (!message.author.bot && message.channel.name === 'slasherbot') {
			// message.reply('bleh');
			const args = message.content.split(' ');

			if (args.length == 0 || args[0].charAt(0) !== '!') return;

			const command = args.shift().substr(1);
			if (Object.keys(rawCommands).includes(command)) {
				rawCommands[command](message);
			}
		}
	},
};