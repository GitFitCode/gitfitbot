/* eslint-disable operator-linebreak */
/**
 * Slash command that open a support ticket when triggered.
 *
 * To trigger, type `/support` on the discord server.
 */

import * as Sentry from '@sentry/node';
import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
  AnyThreadChannel,
  CacheType,
  ComponentType,
  ButtonStyle,
} from 'discord.js';
import {
  CHECK_MARK_EMOJI,
  NOTION_PAGE_ID_DELIMITER,
  NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  THREAD_CLOSING_SUCCESSFUL_MESSAGE,
  THREAD_CREATION_ERROR_MESSAGE,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2,
  THREAD_START_MESSAGE_SLICE_INDEX,
  // Notion DB helper functions
  createNotionDBEntry,
  updateNotionDBEntry,
  NOT_THE_BOT_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  THREAD_CLOSING_MESSAGE,
} from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');
require('dotenv').config();
const config = require('gfc-vault-config');

/**
 * Function to create a thread.
 * @param issueText Text entered by the user.
 * @param interaction CommandInteraction
 */
async function handleThreadCreation(issueText: string, interaction: CommandInteraction) {
  const author = interaction.user;
  const authorUsername = interaction.user.username;
  const channelID = interaction.channel?.id ?? '';

  // Create an entry in the notion database and grab the page id.
  const pageID: string = await createNotionDBEntry(issueText, authorUsername, channelID);

  // Notion link uses pageID without hyphens.
  const pageIDWithoutHyphens = pageID.replaceAll('-', '');
  const notionURL = `${config.notionSupportTicketsDatabaseLink}&p=${pageIDWithoutHyphens}`;

  const content = `${THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1}\`${issueText}\`${THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2}${NOTION_PAGE_ID_DELIMITER}${pageID}`;
  const message = await interaction.followUp({
    ephemeral: true,
    content,
    fetchReply: true,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            url: notionURL,
            label: 'Notion Link',
          },
        ],
      },
    ],
  });

  // Create a thread from the reply sent by the bot.
  const thread = await message.startThread({
    name: String(issueText),
    autoArchiveDuration: 60,
    reason: 'Support Ticket',
  });

  // Send a message in the newly created thread.
  thread.send(`<@&${config.firstRespondersRoleId}> have been notified! ${author} hold tight.`);
}

/**
 * Function to close/archive a thread.
 * @param issueText Text entered by the user
 * @param interaction CommandInteraction
 * @param channel AnyThreadChannel
 */
async function handleThreadClosing(
  interaction: CommandInteraction<CacheType>,
  channel: AnyThreadChannel,
) {
  const starterMessage = await channel.fetchStarterMessage();

  // Check if the thread was created by the bot and contains NOTION_PAGE_ID_DELIMITER.
  if (
    starterMessage?.author.id === config.botId &&
    starterMessage?.content.includes(NOTION_PAGE_ID_DELIMITER)
  ) {
    // THREAD WAS CREATED BY THE BOT

    // Send an appropriate followUp to the thread.
    // Any replies have to be sent BEFORE closing/archiving a thread.
    await interaction.followUp({ ephemeral: true, content: THREAD_CLOSING_MESSAGE });

    // Get all messages in the thread. Caveats:
    // 1. Does not fetch emojis automatically if they have not already been cached.
    // 2. Does not fetch attachments automatically.
    const messagesInThread = await channel.messages.fetch();

    // Grab `cleanContent`, which is the formatted content, and the message author's username.
    const data = messagesInThread.map((message) => ({
      message: message.cleanContent,
      author: message.author.username,
    }));

    // Update the status of the entry in the notion database.
    const notionPageID = String(starterMessage?.content.slice(THREAD_START_MESSAGE_SLICE_INDEX));

    // messages are ordered newest -> oldest
    await updateNotionDBEntry(notionPageID, data.reverse());

    await interaction.editReply(THREAD_CLOSING_SUCCESSFUL_MESSAGE);

    // Close/Archive the thread.
    channel.setArchived(true);

    // Add a ✅ emoji to the message that created this thread.
    starterMessage?.react(CHECK_MARK_EMOJI);
  } else {
    // THREAD WAS NOT CREATED BY THE BOT

    // Send an appropriate followUp to the thread.
    await interaction.followUp({
      ephemeral: true,
      content: NOT_THE_BOT_THREAD_FOR_CLOSING_ERROR_MESSAGE,
    });
  }
}

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/support',
  });

  // Can be a public/private text channel or public/private thread channel.
  const { channel } = interaction;
  const isThread = channel?.isThread();

  // /<command> <subcommand> [<arg>:<value>]
  const commandInput = String(interaction).replace('/support', '').trimStart();

  if (isThread && commandInput.startsWith('close')) {
    // COMMAND INVOKED FOR CLOSING A THREAD

    // Close/archive the thread i.e. the support ticket.
    await handleThreadClosing(interaction, channel);
  } else if (isThread && commandInput.startsWith('create')) {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A THREAD

    // Send an ERROR followUp to the thread.
    await interaction.followUp({ ephemeral: true, content: THREAD_CREATION_ERROR_MESSAGE });
  } else if (!isThread && commandInput.startsWith('close')) {
    // COMMAND INVOKED FOR CLOSING A CHANNEL

    // Send a followUp message.
    await interaction.followUp({
      ephemeral: true,
      content: NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
    });
  } else {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A CHANNEL

    // Snowflake structure received from get(), destructured and renamed.
    // https://discordjs.guide/interactions/slash-commands.html#parsing-options
    const { value: issueText } = interaction.options.get('issue', true);

    // Create a thread to handle the support ticket request.
    await handleThreadCreation(String(issueText), interaction);
  }
  transaction.finish();
  Sentry.setUser(null);
}

const Support: SlashCommand = {
  name: 'support',
  description: 'Helper slash command for managing GFC support tickets.',
  options: [
    {
      name: 'create',
      description: 'Create a support ticket.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'issue',
          description: 'Issue summary.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: 'close',
      description: 'Close a support ticket.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Support;
