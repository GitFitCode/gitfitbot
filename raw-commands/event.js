/**
 * Raw command that replies with a welcome message when triggered.
 *
 * To trigger, type `!event` on the discord server.
 */

const help = '`!event <date>` will create a sample event. Date is in ISO 8601 format. Example: `!event 2022-04-10T15:00:00`';

async function parseMessage(message) {
	const commandText = message.content;
	if (commandText === '!event') {
		await message.reply(help);
	}
	else {
		const guildScheduledEventManger = message.guild.scheduledEvents;
		const date = commandText.replace('!event', '').trim();
		const eventOptions = {
			name: 'sample bot event',
			scheduledStartTime: new Date(date),
			// Privacy Guild Only
			privacyLevel: 2,
			// GuildScheduledEventEntityType Voice
			entityType: 2,
			description: 'sample event created by bot, privacy: guild only, type: voice, voice channel: general',
			// Voice Channel #general
			channel: '957891871810674753',
		};

		await guildScheduledEventManger.create(eventOptions);
		await message.reply('Event Created Successfully!');
	}
}

module.exports = async (message) => {
	await parseMessage(message);
};
