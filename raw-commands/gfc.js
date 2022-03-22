/**
 * Raw command that replies with a welcome message when triggered.
 *
 * To trigger, type `!gfc` on the discord server.
 */

module.exports = async (message) => {
	await message.reply(`Hey〈〈${message.author} 〉〉! The current commands are "gfc", "gfc-guess", "gfc-help."`);
};
