/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable operator-linebreak */

/**
 * Slash command that open a support ticket when triggered.
 *
 * To trigger, type `/support` in the discord server.
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
  ChannelType,
} from 'discord.js';
import { config } from 'gfc-vault-config';
import {
  CHECK_MARK_EMOJI,
  COMMAND_SUPPORT,
  NOTION_PAGE_ID_DELIMITER,
  NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  THREAD_CLOSING_SUCCESSFUL_MESSAGE,
  THREAD_CREATION_ERROR_MESSAGE,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2,
  THREAD_START_MESSAGE_SLICE_INDEX,
  OPEN_AI_QUESTION_IDENTIFIER,
  // Notion DB helper functions
  createNotionSupportTicketsDBEntry,
  updateNotionSupportTicketsDBEntry,
  NOT_THE_BOT_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  THREAD_CLOSING_MESSAGE,
} from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');

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
  const pageID: string = await createNotionSupportTicketsDBEntry(
    issueText,
    authorUsername,
    channelID,
  );

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
    name: String(issueText.substring(0, 50)),
    autoArchiveDuration: 60,
    reason: 'Support Ticket',
  });

  // We need to send the qtn to the thread so we can pick it up for chatGTP to respond.
  thread.send(`${OPEN_AI_QUESTION_IDENTIFIER}: ${issueText}`);
  // Send a message in the newly created thread.
  thread.send(`
    If you check out the Notion link above, you can see that your question has been initially answered by our bot.
  If you have any follow up questions, please ask them by using \`# question\` (without the space) in the thread.

    Also, if you couldn't type out all of your question in the original command, you can type it out in the thread with \`# question\` (without the space).
  The bot will pick it up and respond in the notion document.

  Notion: ${notionURL}
    
  If you are satisfied with the answer, please close the thread by using the \`/support close\` command.

  We have also notified <@&${config.firstRespondersRoleId}> that you need help ${author}.
  `);

  await updateNotionSupportTicketsDBEntry(
    pageID,
    [
      {
        message: `${OPEN_AI_QUESTION_IDENTIFIER}: ${issueText}`,
        author: authorUsername,
      },
    ],
    false,
  );
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
    await updateNotionSupportTicketsDBEntry(notionPageID, data.reverse(), true);

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
    name: `/${COMMAND_SUPPORT.COMMAND_NAME}`,
  });

  // Can be a public/private text/voice-text channel or public/private thread channel.
  const { channel } = interaction;
  const isThread = channel?.isThread();

  // /<command> <subcommand> [<arg>:<value>]
  const commandInput = String(interaction)
    .replace(`/${COMMAND_SUPPORT.COMMAND_NAME}`, '')
    .trimStart();

  if (isThread && commandInput.startsWith(COMMAND_SUPPORT.OPTION_CLOSE)) {
    // COMMAND INVOKED FOR CLOSING A THREAD

    // Close/archive the thread i.e. the support ticket.
    await handleThreadClosing(interaction, channel);
  } else if (isThread && commandInput.startsWith(COMMAND_SUPPORT.OPTION_CREATE)) {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A THREAD

    // Send an ERROR followUp to the thread.
    await interaction.followUp({ ephemeral: true, content: THREAD_CREATION_ERROR_MESSAGE });
  } else if (!isThread && commandInput.startsWith(COMMAND_SUPPORT.OPTION_CLOSE)) {
    // COMMAND INVOKED FOR CLOSING A CHANNEL

    // Send an ERROR followUp to the thread.
    await interaction.followUp({
      ephemeral: true,
      content: NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
    });
  } else if (
    channel?.type !== ChannelType.GuildText &&
    commandInput.startsWith(COMMAND_SUPPORT.OPTION_CREATE)
  ) {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A NON-REGULAR TEXT CHANNEL

    // Send an ERROR followUp to the thread.
    interaction.followUp({ ephemeral: true, content: THREAD_CREATION_ERROR_MESSAGE });
  } else {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A REGULAR TEXT CHANNEL

    // Snowflake structure received from get(), destructured and renamed.
    // https://discordjs.guide/slash-commands/parsing-options.html
    const { value: issueText } = interaction.options.get(COMMAND_SUPPORT.OPTION_ISSUE, true);

    // Create a thread to handle the support ticket request.
    await handleThreadCreation(String(issueText), interaction);
  }
  transaction.finish();
  Sentry.setUser(null);
}

const Support: SlashCommand = {
  name: COMMAND_SUPPORT.COMMAND_NAME,
  description: COMMAND_SUPPORT.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_SUPPORT.OPTION_CREATE,
      description: COMMAND_SUPPORT.OPTION_CREATE_DESCRIPTION,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: COMMAND_SUPPORT.OPTION_ISSUE,
          description: COMMAND_SUPPORT.OPTION_ISSUE_DESCRIPTION,
          type: ApplicationCommandOptionType.String,
          required: true,
          maxLength: 200,
        },
      ],
    },
    {
      name: COMMAND_SUPPORT.OPTION_CLOSE,
      description: COMMAND_SUPPORT.OPTION_CLOSE_DESCRIPTION,
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Support;
