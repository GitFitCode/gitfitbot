/**
 * Raw command that replies with all currently supported commands when triggered.
 *
 * To trigger, type `!gfc-help` on the discord server.
 */

const fs = require('node:fs');

/**
 * Function to gather all currently supported raw and slash (i.e. custom) commands.
 * @returns {String} `allCommandsString`
 */
const prepareCommandsList = () => {
	const rawCommandFiles = fs.readdirSync('./raw-commands').filter(file => file.endsWith('.js'));
	let rawCommandsString = '';

	rawCommandFiles.forEach((value) => {
		const commandName = value.replace('.js', '');
		rawCommandsString = rawCommandsString + '[!' + commandName + ']' + ' ';
	});

	const slashCommandFiles = fs.readdirSync('./slash-commands').filter(file => file.endsWith('.js'));
	let slashCommandsString = '';

	slashCommandFiles.forEach((value) => {
		const commandName = value.replace('.js', '');
		slashCommandsString = slashCommandsString + '[/' + commandName + ']' + ' ';
	});

	const allCommandsString = 'Currently Supported commands:\n' + 'Raw Commands: ' + rawCommandsString + '\n' + 'Slash Commands: ' + slashCommandsString;
	return allCommandsString;
};

module.exports = async (message) => {
	await message.reply(prepareCommandsList());
};
