/**
 * Slash command that open a support ticket when triggered.
 *
 * To trigger, type `/halp` on the discord server.
 */

import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
  AnyThreadChannel,
  CacheType,
} from 'discord.js';
import {
  CHECK_MARK_EMOJI,
  FIRST_RESPONDERS_ROLE_ID,
  NOTION_PAGE_ID_DELIMITER,
  NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  OPTION_DESCRIPTION,
  OPTION_NAME,
  THREAD_CLOSING_SUCCESSFUL_MESSAGE,
  THREAD_CREATION_ERROR_MESSAGE,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2,
  THREAD_START_MESSAGE_SLICE_INDEX,
  // Notion DB helper functions
  createNotionDBEntry,
  updateNotionDBEntry,
  AUTOBOT_ID,
  NOT_THE_BOT_THREAD_FOR_CLOSING_ERROR_MESSAGE,
} from '../utils';
import { SlashCommand } from '../Command';

/**
 * Function to create a thread.
 * @param issueText Text entered by the user
 * @param interaction CommandInteraction
 */
async function handleThreadCreation(
  issueText: string | number | boolean | undefined,
  interaction: CommandInteraction,
) {
  const author = interaction.user;
  const authorUsername = interaction.user.username;
  const channelID = interaction.channel?.id ?? '';

  // Create an entry in the notion database.
  const pageID: string = await createNotionDBEntry(issueText, authorUsername, channelID);

  const content = `${THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1}\`${issueText}\`${THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2}${NOTION_PAGE_ID_DELIMITER}${pageID}`;

  // Send a followUp message.
  const message = await interaction.followUp({
    ephemeral: true,
    content,
    fetchReply: true,
  });

  // Create a thread from the reply sent by the bot.
  const thread = await message.startThread({
    name: String(issueText),
    autoArchiveDuration: 60,
    reason: 'Support Ticket',
  });

  // Send a message in the newly created thread.
  thread.send(`<@&${FIRST_RESPONDERS_ROLE_ID}> have been notified! ${author} hold tight.`);
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

  // Check if the thread was created by the bot.
  if (starterMessage?.author.id === AUTOBOT_ID) {
    // THREAD WAS CREATED BY THE BOT

    // Send an appropriate followUp to the thread.
    // Any replies have to be sent BEFORE closing/archiving a thread.
    await interaction.followUp({
      ephemeral: true,
      content: THREAD_CLOSING_SUCCESSFUL_MESSAGE,
    });

    // Close/Archive the thread.
    channel.setArchived(true);

    // Add a ✅ emoji to the message that created this thread.
    starterMessage?.react(CHECK_MARK_EMOJI);

    // Get all messages in the thread. Caveats:
    // 1. Does not fetch emojis automatically if they have not aleady been cached.
    // 2. Does not fetch attachments automatically.
    const messagesInThread = await channel.messages.fetch();

    // For now, we only need `cleanContent` which is a formatted content string.
    const cleanedMessages = messagesInThread.map((message) => message.cleanContent);

    // Update the status of the entry in the notion database.
    const notionPageID = String(starterMessage?.content.slice(THREAD_START_MESSAGE_SLICE_INDEX));
    // cleanedMessages are ordered newest -> oldest
    updateNotionDBEntry(notionPageID, cleanedMessages.reverse());
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
  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/interactions/slash-commands.html#parsing-options
  const { value: issueText } = interaction.options.get(OPTION_NAME, true);

  // Can be a text channel or public thread channel.
  const { channel } = interaction;
  const isThread = channel?.isThread();

  if (isThread && issueText === 'close') {
    // COMMAND INVOKED FOR CLOSING A THREAD

    // Close/archive the thread i.e. the support ticket.
    handleThreadClosing(interaction, channel);
  } else if (isThread && issueText !== 'close') {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A THREAD

    // Send an ERROR followUp to the thread.
    await interaction.followUp({
      ephemeral: true,
      content: THREAD_CREATION_ERROR_MESSAGE,
    });
  } else if (!isThread && issueText === 'close') {
    // COMMAND INVOKED FOR CLOSING A CHANNEL

    // Send a followUp message.
    await interaction.followUp({
      ephemeral: true,
      content: NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
    });
  } else {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A CHANNEL

    // Create a thread to handle the support ticket request.
    handleThreadCreation(issueText, interaction);
  }
}

const Halp: SlashCommand = {
  name: 'halp',
  description: OPTION_DESCRIPTION,
  options: [
    {
      name: OPTION_NAME,
      description: OPTION_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    executeRun(interaction);
  },
};

export default Halp;
