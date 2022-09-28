/* eslint-disable operator-linebreak */
/**
 * Helper slash command for managing GFC events.
 *
 * To trigger, type `/events` on the discord server.
 */

import * as Sentry from '@sentry/node';
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
import { Transaction } from '@sentry/types';
import { SlashCommand } from '../Command';
import { buildEventOptions } from '../utils';

require('@sentry/tracing');
require('dotenv').config();
const config = require('gfc-vault-config');

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

      sentryTransaction.setData('success', true);
    } else {
      // DATE IS VALID BUT NOT INTO THE FUTURE

      const content = `The date you gave me is ${formatted} into the past.`;
      await interaction.followUp({ content });

      sentryTransaction.setData('success', false);
    }
  } else {
    // DATE IS NOT VALID

    const content = 'Invalid date provided!';
    await interaction.followUp({ content });

    sentryTransaction.setData('success', false);
  }
}

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
    const content = 'No scheduled events currently.';
    interaction.followUp({ ephemeral: true, content });
  }
  transactionForList.finish();
}

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

async function handleCodewarsEvent(interaction: CommandInteraction) {
  const transactionForCodewars = Sentry.startTransaction({
    op: 'transaction',
    name: '/events codewars',
  });

  const eventName = 'GitFitCode Codewars';
  const eventDescription = "Let's solve some katas on [codewars](https://www.codewars.com) !";
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

async function executeRun(interaction: CommandInteraction) {
  // TODO figure out a way to set user scope for all subcommands
  // https://sentry.io/organizations/gitfitcode/performance/summary/events/?project=4503888464314368&query=transaction.duration%3A%3C15m&statsPeriod=24h&transaction=%2Fevents+codewars

  // TODO also add success and date as tags (in addition to data)

  Sentry.configureScope((scope) => {
    scope.setUser({
      id: interaction.user.id,
      username: interaction.user.username,
    });
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

  transactionForEvents.finish();
  Sentry.setUser(null);
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
