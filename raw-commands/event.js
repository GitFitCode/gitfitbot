/**
 * Raw command that replies with a welcome message when triggered.
 *
 * To trigger, type `!event` on the discord server.
 */

const help = '`!event \'name\' \'description\' \'start date\' \'end date\'`. Date is in ISO 8601 format, with `end date` > `start date`; all options are mandatory.\n\nExample: `!event \'test event\' \'testing my sample event, 1hr.\' \'2022-04-10T15:00:00\' \'2022-04-10T16:00:00\'`';

async function parseMessage(message) {
	const commandText = message.content;
	if (commandText === '!event') {
		await message.reply(help);
	}
	else {
		const guildScheduledEventManger = message.guild.scheduledEvents;

		// We currently support 4 options: name, description, start date, end date.
		const optionsText = commandText.replace('!event', '');
		const optionsCount = countOptions(optionsText);

		// Very simple check to see if the command is properly formatted. This assumes that there are no single/double quotes in the command invocation text.
		// Easy to bypass by providing # of options * 2 single quotes in random places.
		// TODO GFC challenge: fix this bypass mechanism
		if (optionsCount !== 8) {
			await message.reply('Missing options or command not formatted properly. Please run `!event` to see the format.');
		}
		else {
			const optionsRawList = optionsText.split('\'');
			const name = optionsRawList[1];
			const description = optionsRawList[3];
			const startDate = optionsRawList[5];
			const endDate = optionsRawList[7];

			if (new Date(endDate).getTime() > new Date(startDate).getTime()) {
				await scheduleEvent(message, guildScheduledEventManger, name, description, startDate, endDate);
			}
			else {
				await message.reply('Event end date is not later than event start date!');
			}
		}
	}
}

async function scheduleEvent(message, guildScheduledEventManger, name, description, startDate, endDate) {
	const eventOptions = {
		name: name,
		description: description,
		scheduledStartTime: new Date(startDate),
		scheduledEndTime: new Date(endDate),
		// Privacy: GUILD_ONLY
		privacyLevel: 2,
		// Entity Type: EXTERNAL
		entityType: 3,
		entityMetadata: { location: '#general' },
	};

	await guildScheduledEventManger.create(eventOptions);
	await message.reply('Event Created Successfully!');
}

function countOptions(optionsText) {
	let count = 0;
	let p = optionsText.indexOf('\'');

	while (p !== -1) {
		count++;
		p = optionsText.indexOf('\'', p + 1);
	}
	return count;
}

module.exports = async (message) => {
	await parseMessage(message);
};

// Note: Handling such complex commands would be much easier by leveraging the underlying slash command infrastructure provided by discord.js, but hey! :)