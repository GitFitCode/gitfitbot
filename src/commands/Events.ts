/* eslint-disable operator-linebreak */
/**
 * Helper slash command for managing GFC events.
 *
 * To trigger, type `/events` in the discord server.
 */

import * as Sentry from '@sentry/node';
import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
  GuildScheduledEventCreateOptions,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  ChannelType,
  Collection,
  Role,
} from 'discord.js';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Transaction } from '@sentry/types';
import { config } from 'gfc-vault-config';
import { SlashCommand } from '../Command';
import { buildEventOptions } from '../utils';

require('@sentry/tracing');

dayjs.extend(duration);

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
  sentryTransaction: Transaction,
) {
  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/interactions/slash-commands.html#parsing-options
  const { value: year } = interaction.options.get('year', true);
  const { value: month } = interaction.options.get('month', true);
  const { value: day } = interaction.options.get('day', true);
  const { value: hour } = interaction.options.get('hour', true);
  const { value: minute } = interaction.options.get('minute', true);
  const { value: ampm } = interaction.options.get('ampm', true);
  const { value: timezone } = interaction.options.get('timezone', true);

  const retrievedDate = `${year}-${month}-${day} ${hour}:${minute} ${ampm} ${timezone}`;

  sentryTransaction.setData('date', retrievedDate);
  sentryTransaction.setTag('date', retrievedDate);

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

      const content = `\`${eventName}\` event scheduled!`;
      await interaction.followUp({ content });

      sentryTransaction.setData('success', true);
      sentryTransaction.setTag('success', true);
    } else {
      // DATE IS VALID BUT NOT INTO THE FUTURE

      const content = `The date you gave me is ${formatted} into the past.`;
      await interaction.followUp({ content });

      sentryTransaction.setData('success', false);
      sentryTransaction.setTag('success', false);
    }
  } else {
    // DATE IS NOT VALID

    const content = 'Invalid date provided!';
    await interaction.followUp({ content });

    sentryTransaction.setData('success', false);
    sentryTransaction.setTag('success', false);
  }
}

/**
 * Function to list all scheduled events in the discord server.
 * @param interaction CommandInteraction
 */
async function handleListEvent(interaction: CommandInteraction) {
  const transactionForList = Sentry.startTransaction({
    op: 'transaction',
    name: '/events list',
  });

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
    const content = 'No events have been scheduled currently.';
    interaction.followUp({ ephemeral: true, content });
  }
  transactionForList.finish();
}

/**
 * Function to build information for scheduling a retrospective event in the discord server.
 * @param interaction CommandInteraction
 */
async function handleRetroEvent(interaction: CommandInteraction) {
  const transactionForRetro = Sentry.startTransaction({
    op: 'transaction',
    name: '/events retro',
  });

  const eventName = 'GitFitCode Retrospective';
  const eventDescription =
    "Let's reflect on your last week's EBIs & WWWs and create some tangible action items!";
  const eventChannelID = config.checkinsVoiceChannelId;

  await handleEventCreation(
    interaction,
    eventName,
    eventDescription,
    eventChannelID,
    transactionForRetro,
  );

  transactionForRetro.finish();
}

/**
 * Function to build information for scheduling a codewars event in the discord server.
 * @param interaction CommandInteraction
 */
async function handleCodewarsEvent(interaction: CommandInteraction) {
  const transactionForCodewars = Sentry.startTransaction({
    op: 'transaction',
    name: '/events codewars',
  });

  const eventName = 'GitFitCode Codewars';
  const eventDescription = "Let's solve some katas on https://www.codewars.com !";
  const eventChannelID = config.virtualOfficeVoiceChannelId;

  await handleEventCreation(
    interaction,
    eventName,
    eventDescription,
    eventChannelID,
    transactionForCodewars,
  );

  transactionForCodewars.finish();
}

/**
 * Function to build information for scheduling a custom event in the discord server.
 * @param interaction CommandInteraction
 */
async function handleCustomEvent(interaction: CommandInteraction) {
  const transactionForCodewars = Sentry.startTransaction({
    op: 'transaction',
    name: '/events custom',
  });

  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/interactions/slash-commands.html#parsing-options
  const { value: name } = interaction.options.get('name', true);
  const { value: description } = interaction.options.get('desc', true);
  const { value: channel } = interaction.options.get('voice-channel', true);

  // Fetch the channel object.
  const channelObj = await interaction.guild?.channels.fetch(String(channel));

  if (channelObj?.type !== ChannelType.GuildVoice) {
    const content = 'Please select a voice channel!';

    interaction.followUp({ ephemeral: true, content });
  } else {
    await handleEventCreation(
      interaction,
      String(name),
      String(description),
      String(channel),
      transactionForCodewars,
    );
  }

  transactionForCodewars.finish();
}

/**
 * Function to clear all scheduled events from the discord server.
 * @param interaction CommandInteraction
 */
async function handleClearEvent(interaction: CommandInteraction) {
  const transactionForCodewars = Sentry.startTransaction({
    op: 'transaction',
    name: '/events clear',
  });

  const roles = interaction.member?.roles.valueOf() as Collection<string, Role>;
  const foundAdminRole = roles.find((role) => role.id === config.adminRoleID);

  if (foundAdminRole) {
    const eventManager = interaction.guild?.scheduledEvents;
    const events = await eventManager?.fetch();

    if (events && events.size > 0) {
      events.forEach(async (event) => {
        await event.delete();
      });

      const content = 'All events have been cleared!';

      interaction.followUp({ ephemeral: true, content });
    } else {
      const content = 'No events found!';

      interaction.followUp({ ephemeral: true, content });
    }
  } else {
    const content = 'Only admins can use this command!';

    interaction.followUp({ ephemeral: true, content });
  }

  transactionForCodewars.finish();
}

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transactionForEvents = Sentry.startTransaction({
    op: 'transaction',
    name: '/events',
  });

  // /<command> <subcommand> [<arg>:<value>]
  const commandInput = String(interaction).replace('/events', '').trimStart();

  // Check if subcommand `list` was fired.
  if (commandInput.startsWith('list')) {
    handleListEvent(interaction);
  }

  // Check if subcommand `retro` was fired.
  if (commandInput.startsWith('retro')) {
    handleRetroEvent(interaction);
  }

  // Check if subcommand `codewars` was fired.
  if (commandInput.startsWith('codewars')) {
    handleCodewarsEvent(interaction);
  }

  // Check if subcommand `custom` was fired.
  if (commandInput.startsWith('custom')) {
    handleCustomEvent(interaction);
  }

  // Check if subcommand `clear` was fired.
  if (commandInput.startsWith('clear')) {
    handleClearEvent(interaction);
  }

  transactionForEvents.finish();
  Sentry.setUser(null);
}

const Events: SlashCommand = {
  name: 'events',
  description: 'Helper slash command for managing GFC events.',
  options: [
    {
      name: 'custom',
      description: 'Schedule a custom event.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'name',
          description: 'Name of the custom event.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'desc',
          description: 'Description of the custom event.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'voice-channel',
          description: 'Name of the channel to schedule the custom event in.',
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
        ...buildEventOptions('custom'),
      ],
    },
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
    {
      name: 'clear',
      description: 'Clear all scheduled events (admins only).',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Events;
