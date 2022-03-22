/**
 * Raw command that replies with a help message when triggered.
 *
 * To trigger, type `!gfc-help` on the discord server.
 */

module.exports = async (message) => {
	await message.reply(`Hey there〈〈${message.author} 〉〉! You just ran [COMMAND:gfc-help] Right now some bad ass gfc community member needs to get this command implemented! Maybe that dope person is you?`);
};