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
} from "discord.js";
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
} from "../utils";
import { SlashCommand } from "../Command";

/**
 * Function to create a thread.
 * @param issueText Text entered by the user
 * @param interaction CommandInteraction
 */
async function _handleThreadCreation(
  issueText: string | number | boolean | undefined,
  interaction: CommandInteraction
) {
  // "/halp close" WAS NOT CALLED IN A NON-THREAD CHANNEL
  const author = interaction.user;
  const authorUsername = interaction.user.username;
  const channelID = interaction.channel?.id ?? "";

  // Create an entry in the notion database.
  const pageID: string = await createNotionDBEntry(
    issueText,
    authorUsername,
    channelID
  );

  const content =
    THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1 +
    "`" +
    issueText +
    "`" +
    THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2 +
    NOTION_PAGE_ID_DELIMITER +
    pageID;

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
    reason: "Support Ticket",
  });

  // Send a message in the newly created thread.
  thread.send(
    `<@&${FIRST_RESPONDERS_ROLE_ID}> have been notified! ${author} hold tight.`
  );
}

/**
 * Function to close/archive a thread.
 * @param issueText Text entered by the user
 * @param interaction CommandInteraction
 * @param channel AnyThreadChannel
 */
async function _handleThreadClosing(
  interaction: CommandInteraction<CacheType>,
  channel: AnyThreadChannel
) {
  // COMMAND INVOKED FOR CLOSING THE THREAD

  // Send an appropriate followUp to the thread.
  // Any replies have to be sent BEFORE closing/archiving a thread.
  await interaction.followUp({
    ephemeral: true,
    content: THREAD_CLOSING_SUCCESSFUL_MESSAGE,
  });

  // Close/Archive the thread.
  channel.setArchived(true);

  // Add a ✅ emoji to the message that created this thread.
  const starterMessage = await channel.fetchStarterMessage();
  starterMessage?.react(CHECK_MARK_EMOJI);

  // Update the status of the entry in the notion database.
  const pageID = String(
    starterMessage?.content.slice(THREAD_START_MESSAGE_SLICE_INDEX)
  );
  updateNotionDBEntry(pageID);
}

async function _executeRun(interaction: CommandInteraction) {
  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/interactions/slash-commands.html#parsing-options
  const { value: issueText } = interaction.options.get(OPTION_NAME, true);

  // Can be a text channel or public thread channel.
  const channel = interaction.channel;
  const isThread = channel?.isThread();

  if (isThread && issueText === "close") {
    // COMMAND INVOKED FOR CLOSING A THREAD

    // TODO edit entry from notion db and dump all interactions from thread into it

    // Close/archive the thread i.e. the support ticket.
    _handleThreadClosing(interaction, channel);
  } else if (isThread && issueText !== "close") {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A THREAD

    // Send an ERROR followUp to the thread.
    await interaction.followUp({
      ephemeral: true,
      content: THREAD_CREATION_ERROR_MESSAGE,
    });
  } else if (!isThread && issueText === "close") {
    // COMMAND INVOKED FOR CLOSING A CHANNEL

    // Send a followUp message.
    await interaction.followUp({
      ephemeral: true,
      content: NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
    });
  } else {
    // COMMAND INVOKED FOR CREATING A SUPPORT TICKET IN A CHANNEL

    // Create a thread to handle the support ticket request.
    _handleThreadCreation(issueText, interaction);
  }
}

export const Halp: SlashCommand = {
  name: "halp",
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
    _executeRun(interaction);
  },
};
