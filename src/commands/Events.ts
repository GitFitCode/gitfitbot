/* eslint-disable operator-linebreak */
/**
 * Helper slash command for managing GFC events.
 *
 * To trigger, type `/events` on the discord server.
 */

import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
  GuildScheduledEventCreateOptions,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} from 'discord.js';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { SlashCommand } from '../Command';
import { buildEventOptions } from '../utils';

dayjs.extend(duration);

require('dotenv').config();
const config = require('gfc-vault-config');

/**
 * Function to schedule an event in the discord server.
 * @param interaction CommandInteraction
 * @param eventName Name of the event.
 * @param eventDescription Description of the event.
 * @param eventChannelID Channel ID of the Voice Channel for the event.
 */
async function handleEventCreation(
  interaction: CommandInteraction,
  eventName: string,
  eventDescription: string,
  eventChannelID: string,
) {
  const { value: year } = interaction.options.get('year', true);
  const { value: month } = interaction.options.get('month', true);
  const { value: day } = interaction.options.get('day', true);
  const { value: hour } = interaction.options.get('hour', true);
  const { value: minute } = interaction.options.get('minute', true);
  const { value: ampm } = interaction.options.get('ampm', true);

  if (
    typeof year === 'number' &&
    typeof month === 'number' &&
    typeof day === 'number' &&
    typeof hour === 'number' &&
    typeof minute === 'number' &&
    typeof ampm === 'string'
  ) {
    const retrievedDate = `${year}-${month}-${day} ${hour}:${minute} ${ampm}`;

    // Check if the date provided by user is valid.
    if (dayjs(retrievedDate).isValid()) {
      // DATE IS VALID

      const date = dayjs(retrievedDate).toDate();

      const now = dayjs().toDate();
      const difference = date.valueOf() - now.valueOf();
      const formatted = dayjs.duration(difference, 'ms').format();

      if (difference > 0) {
        // DATE IS VALID AND INTO THE FUTURE

        // Build options required for the event.
        const eventOptions: GuildScheduledEventCreateOptions = {
          name: eventName,
          scheduledStartTime: date,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
          entityType: GuildScheduledEventEntityType.Voice,
          description: eventDescription,
          channel: eventChannelID,
        };

        // Retrieve the discord event manager.
        const guildScheduledEventManger = interaction.guild?.scheduledEvents;
        // Create an event with the given options.
        await guildScheduledEventManger?.create(eventOptions);

        const content = `${eventName} event scheduled!`;

        await interaction.followUp({ content });
      } else {
        // DATE IS VALID BUT NOT INTO THE FUTURE

        const content = `The date you gave me is ${formatted} into the past.`;

        await interaction.followUp({ content });
      }
    } else {
      // DATE IS NOT VALID

      const content = 'Invalid date provided!';

      await interaction.followUp({ content });
    }
  } else {
    const content = 'Invalid date provided!';

    await interaction.followUp({ content });
  }
}

async function executeRun(interaction: CommandInteraction) {
  // /<command> <subcommand> [<arg>:<value>]
  const commandInput = String(interaction).replace('/events', '').trimStart();

  // Check if subcommand `list` was fired.
  if (commandInput.startsWith('list')) {
    const discordEventManager = interaction.guild?.scheduledEvents;
    const scheduledEvents = await discordEventManager?.fetch();

    if (scheduledEvents && scheduledEvents?.size > 0) {
      let content =
        scheduledEvents.size === 1
          ? `${scheduledEvents.size} event scheduled:\n`
          : `${scheduledEvents.size} events scheduled:\n`;

      for (let i = 0; i < scheduledEvents.size; i += 1) {
        content = content.concat(
          '\n',
          scheduledEvents.size === 1 ? '' : `Event #${i + 1}`,
          scheduledEvents.size === 1 ? '' : '\n',
          `\`${scheduledEvents.at(i)?.name}\``,
          '\n',
          scheduledEvents.at(i)?.description ?? '',
          '\n',
          dayjs(scheduledEvents.at(i)?.scheduledStartTimestamp).toString(),
          '\n',
          '\n',
        );
      }

      interaction.followUp({ ephemeral: true, content });
    } else {
      const content = 'No scheduled events currently.';

      interaction.followUp({ ephemeral: true, content });
    }
  }

  // Check if subcommand `retro` was fired.
  if (commandInput.startsWith('retro')) {
    const eventName = 'GitFitCode Retrospective';
    const eventDescription =
      "Let's reflect on your last week's EBIs & WWWs and create some tangible action items!";
    const eventChannelID = config.checkinsVoiceChannelId;

    await handleEventCreation(interaction, eventName, eventDescription, eventChannelID);
  }

  // Check if subcommand `codewars` was fired.
  if (commandInput.startsWith('codewars')) {
    const eventName = 'GitFitCode Codewars';
    const eventDescription = "Let's solve some katas on codewars!";
    const eventChannelID = config.virtualOfficeVoiceChannelId;

    await handleEventCreation(interaction, eventName, eventDescription, eventChannelID);
  }
}

const Events: SlashCommand = {
  name: 'events',
  description: 'Helper slash command for managing GFC events.',
  options: [
    {
      name: 'list',
      description: 'List all scheduled events.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'retro',
      description: 'Schedule a GFC retrospective event.',
      type: ApplicationCommandOptionType.Subcommand,
      options: buildEventOptions('retro'),
    },
    {
      name: 'codewars',
      description: 'Schedule a GFC codewars event.',
      type: ApplicationCommandOptionType.Subcommand,
      options: buildEventOptions('codewars'),
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Events;
