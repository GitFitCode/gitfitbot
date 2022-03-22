/**
 * Raw command that replies with a random message when triggered.
 *
 * To trigger, type `!gfc-guess` on the discord server.
 */

const guess = [
	'As I see it, yes.',
	'Ask again later.',
	'Better not tell you now.',
	'Cannot predict now.',
	'Concentrate and ask again.',
	'Don\'t count on it.',
	'It is certain.',
	'It is decidedly so.',
];

module.exports = async (message) => {
	const i = Math.floor(Math.random() * guess.length);
	const reply = guess[i];
	await message.reply(`〈〈${message.author}〉〉⌨︎ ${reply}`);
};
