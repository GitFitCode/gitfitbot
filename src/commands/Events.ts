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
  ComponentType,
  ButtonStyle,
} from 'discord.js';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Transaction } from '@sentry/types';
import { config } from 'gfc-vault-config';
import { SlashCommand } from '../Command';
import { buildEventOptions, COMMAND_EVENT } from '../utils';

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
  // https://discordjs.guide/slash-commands/parsing-options.html
  const { value: year } = interaction.options.get(COMMAND_EVENT.OPTION_YEAR, true);
  const { value: month } = interaction.options.get(COMMAND_EVENT.OPTION_MONTH, true);
  const { value: day } = interaction.options.get(COMMAND_EVENT.OPTION_DAY, true);
  const { value: hour } = interaction.options.get(COMMAND_EVENT.OPTION_HOUR, true);
  const { value: minute } = interaction.options.get(COMMAND_EVENT.OPTION_MINUTE, true);
  const { value: ampm } = interaction.options.get(COMMAND_EVENT.OPTION_AMPM, true);
  const { value: timezone } = interaction.options.get(COMMAND_EVENT.OPTION_TIMEZONE, true);
  const role = interaction.options.get(COMMAND_EVENT.OPTION_ROLE, false);

  const retrievedDate = `${year}-${month}-${day} ${hour}:${minute} ${ampm} ${timezone}`;

  sentryTransaction.setData('date', retrievedDate);
  sentryTransaction.setTag('date', retrievedDate);

  // Check if the date provided by user is valid.
  if (dayjs(retrievedDate).isValid()) {
    // DATE FORMAT IS VALID

    const date = dayjs(retrievedDate).toDate();

    const now = dayjs().toDate();
    const difference = date.valueOf() - now.valueOf();
    const formattedDifference = dayjs.duration(difference, 'ms').format();

    if (difference > 0) {
      // DATE FORMAT IS VALID AND INTO THE FUTURE

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
      try {
        const discordEvent = await guildScheduledEventManger?.create(eventOptions);
        const eventLink = discordEvent?.url;
        let content = `\`${eventName}\` event scheduled!`;
        if (role) {
          content += ` Notified <@&${role.value}>`;
        }
        const eventComponents: any = [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            url: eventLink ?? 'https://www.gitfitcode.com',
            label: 'Discord Event Link',
          },
        ];

        await interaction.followUp({
          ephemeral: true,
          content,
          components: [
            {
              type: ComponentType.ActionRow,
              components: eventComponents,
            },
          ],
        });

        sentryTransaction.setData('success', true);
        sentryTransaction.setTag('success', true);
      } catch (err) {
        console.error(err);

        await interaction.followUp({
          ephemeral: true,
          content: 'Unable to schedule the event due to an error.',
        });

        sentryTransaction.setData('success', false);
        sentryTransaction.setTag('success', false);
      }
    } else {
      // DATE FORMAT IS VALID BUT INTO THE PAST

      const content = `The date you gave me is ${formattedDifference} into the past.`;
      await interaction.followUp({ content });

      sentryTransaction.setData('success', false);
      sentryTransaction.setTag('success', false);
    }
  } else {
    // DATE FORMAT IS NOT VALID

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
    name: `/${COMMAND_EVENT.COMMAND_NAME} list`,
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
async function handleRetroEvent(_client: Client, interaction: CommandInteraction) {
  const transactionForRetro = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_EVENT.COMMAND_NAME} retro`,
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
async function handleCodewarsEvent(_client: Client, interaction: CommandInteraction) {
  const transactionForCodewars = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_EVENT.COMMAND_NAME} codewars`,
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
async function handleCustomEvent(_client: Client, interaction: CommandInteraction) {
  const transactionForCodewars = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_EVENT.COMMAND_NAME} custom`,
  });

  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/slash-commands/parsing-options.html
  const { value: name } = interaction.options.get(COMMAND_EVENT.OPTION_NAME, true);
  const { value: description } = interaction.options.get(COMMAND_EVENT.OPTION_DESCRIPTION, true);
  const { value: channel } = interaction.options.get(COMMAND_EVENT.OPTION_VOICE_CHANNEL, true);

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
    name: `/${COMMAND_EVENT.COMMAND_NAME} clear`,
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

async function executeRun(client: Client, interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transactionForEvents = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_EVENT.COMMAND_NAME}`,
  });

  // /<command> <subcommand> [<arg>:<value>]
  const commandInput = String(interaction)
    .replace(`/${COMMAND_EVENT.COMMAND_NAME}`, '')
    .trimStart();

  // Check if subcommand `list` was fired.
  if (commandInput.startsWith(COMMAND_EVENT.OPTION_LIST)) {
    handleListEvent(interaction);
  }

  // Check if subcommand `retro` was fired.
  if (commandInput.startsWith(COMMAND_EVENT.OPTION_RETRO)) {
    handleRetroEvent(client, interaction);
  }

  // Check if subcommand `codewars` was fired.
  if (commandInput.startsWith(COMMAND_EVENT.OPTION_CODEWARS)) {
    handleCodewarsEvent(client, interaction);
  }

  // Check if subcommand `custom` was fired.
  if (commandInput.startsWith(COMMAND_EVENT.OPTION_CUSTOM)) {
    handleCustomEvent(client, interaction);
  }

  // Check if subcommand `clear` was fired.
  if (commandInput.startsWith(COMMAND_EVENT.OPTION_CLEAR)) {
    handleClearEvent(interaction);
  }

  transactionForEvents.finish();
  Sentry.setUser(null);
}

const Events: SlashCommand = {
  name: COMMAND_EVENT.COMMAND_NAME,
  description: COMMAND_EVENT.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_EVENT.OPTION_CUSTOM,
      description: COMMAND_EVENT.OPTION_CUSTOM_DESCRIPTION,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: COMMAND_EVENT.OPTION_NAME,
          description: COMMAND_EVENT.OPTION_NAME_DESCRIPTION,
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: COMMAND_EVENT.OPTION_DESCRIPTION,
          description: COMMAND_EVENT.OPTION_DESCRIPTION_DESCRIPTION,
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: COMMAND_EVENT.OPTION_VOICE_CHANNEL,
          description: COMMAND_EVENT.OPTION_VOICE_CHANNEL_DESCRIPTION,
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
        ...buildEventOptions(COMMAND_EVENT.OPTION_CUSTOM),
      ],
    },
    {
      name: COMMAND_EVENT.OPTION_LIST,
      description: COMMAND_EVENT.OPTION_LIST_DESCRIPTION,
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: COMMAND_EVENT.OPTION_RETRO,
      description: COMMAND_EVENT.OPTION_RETRO_DESCRIPTION,
      type: ApplicationCommandOptionType.Subcommand,
      options: buildEventOptions(COMMAND_EVENT.OPTION_RETRO),
    },
    {
      name: COMMAND_EVENT.OPTION_CODEWARS,
      description: COMMAND_EVENT.OPTION_CODEWARS_DESCRIPTION,
      type: ApplicationCommandOptionType.Subcommand,
      options: buildEventOptions(COMMAND_EVENT.OPTION_CODEWARS),
    },
    {
      name: COMMAND_EVENT.OPTION_CLEAR,
      description: COMMAND_EVENT.OPTION_CLEAR_DESCRIPTION,
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],
  run: async (client: Client, interaction: CommandInteraction) => {
    await executeRun(client, interaction);
  },
};

export default Events;
