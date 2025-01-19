/**
 * Slash command that retrieves metadata about a specific thread in a selected channel.
 *
 * To trigger, type `/thread-info` in the Discord server.
 */

import { 
  CommandInteraction, 
  Client, 
  ChannelType, 
  EmbedBuilder, 
  ApplicationCommandOptionType,
  TextChannel,
  ColorResolvable,
  AutocompleteInteraction,
  GuildForumThreadManager,
  ForumChannel,
  ThreadChannel
} from 'discord.js';
import { COMMAND_THREAD_INFO } from '../utils';
import { SlashCommand } from 'src/Command';

const threadTypeToString = (type: ChannelType): string => {
  switch (type) {
    case ChannelType.AnnouncementThread:
      return 'Announcement Thread';
    case ChannelType.PublicThread:
      return 'Public Thread';
    case ChannelType.PrivateThread:
      return 'Private Thread';
    default:
      return 'Unknown';
  }
};
/**
 * Executes the `/thread-info` command.
 * 
 * @param interaction - The command interaction instance.
 */
async function executeRun(interaction: CommandInteraction) {
  try {
    // Check if the interaction has already been deferred or replied to
    if (!interaction.deferred && !interaction.replied) {
      // Defer the reply to allow more processing time if needed
      await interaction.deferReply({ ephemeral: true });
    }
    console.log('Received options:', interaction.options.data);
    // Retrieve the channel and thread ID from the command options
    const channelOption = interaction.options.get('channel', true);
    const channel = channelOption?.channel as TextChannel | null;
    if (!channel) {
      return interaction.editReply({
        content: COMMAND_THREAD_INFO.ERROR_MESSAGES.INVALID_CHANNEL,
      });
    }

    const threadIdOption = interaction.options.get('thread_id', true);
    const threadId = threadIdOption?.value as string;

    const thread = await channel.threads.fetch(threadId);

    if (!thread) {
      return interaction.editReply({
        content: COMMAND_THREAD_INFO.ERROR_MESSAGES.THREAD_NOT_FOUND,
      });
    }

    // Create an embed with the thread metadata
    const embed = new EmbedBuilder()
      .setTitle(COMMAND_THREAD_INFO.SUCCESS_MESSAGES.THREAD_INFO_TITLE)
      .setColor(COMMAND_THREAD_INFO.EMBED_COLORS.DEFAULT as ColorResolvable)
      .addFields(
        { name: 'Name', value: thread.name || 'N/A', inline: true },
        { name: 'ID', value: thread.id, inline: true },
        {
          name: 'Created At',
          value: thread.createdAt ? thread.createdAt.toLocaleString() : 'N/A',
          inline: true,
        },
        { name: 'Owner ID', value: thread.ownerId || 'N/A', inline: true },
        { name: 'Archived?', value: thread.archived ? 'Yes' : 'No', inline: true },
        { name: 'Locked?', value: thread.locked ? 'Yes' : 'No', inline: true },
        { name: 'Member Count', value: thread?.memberCount?.toString() ?? '0', inline: true },
        { name: 'Message Count', value: thread?.messageCount?.toString() ?? '0', inline: true },
        { name: 'Auto-Archive Duration', value: `${thread.autoArchiveDuration} minutes`, inline: true },
        { name: 'Archived At', value: thread.archivedAt ? thread.archivedAt.toLocaleString() : 'N/A', inline: true },
        { name: 'Type', value: threadTypeToString(thread.type), inline: true },
        { name: 'Last Message ID', value: thread.lastMessageId || 'N/A', inline: true },
        { name: 'Last Pin Timestamp', value: thread.lastPinTimestamp ? new Date(thread.lastPinTimestamp).toLocaleString() : 'N/A', inline: true },
        { name: 'Invitable', value: thread.invitable ? 'Yes' : 'No', inline: true }
      )
      .setTimestamp();

    // Edit the deferred reply with the embed
    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    if (!interaction.replied) {
      return interaction.editReply({
        content: COMMAND_THREAD_INFO.ERROR_MESSAGES.FETCH_ERROR,
      });
    }
  }
}


const ThreadInfo: SlashCommand = {
  name: COMMAND_THREAD_INFO.COMMAND_NAME,
  description: COMMAND_THREAD_INFO.COMMAND_DESCRIPTION,
  // Define the command options
  options: [
    {
      name: 'channel',
      type: ApplicationCommandOptionType.Channel,
      description: 'Select the channel that contains the thread.',
      required: true,
      channelTypes: [ChannelType.GuildForum],
    },
    {
      name: 'thread_id',
      type: ApplicationCommandOptionType.String,
      description: 'The ID of the thread.',
      required: true,
      autocomplete: true,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
  autocomplete: async (interaction: AutocompleteInteraction) => {
    console.log('Autocomplete triggered');
    const channelOption = interaction.options.get('channel', true);
    const channelId = channelOption?.value as string;
  
    console.log(`channelOption: ${JSON.stringify(channelOption)}`);
    console.log('Channel ID:', channelId);
  
    try {
      // Fetch the channel using the channel ID
      const channel = await interaction.guild?.channels.fetch(channelId);
  
      if (!channel || channel.type !== ChannelType.GuildForum) {
        console.log('No valid forum channel selected');
        return interaction.respond([]);
      }
  
      // Fetch active threads from the channel
      const threads = await channel.threads.fetchActive();
      const choices = threads.threads.map((thread: ThreadChannel) => ({
        name: thread.name,
        value: thread.id,
      }));
  
      console.log('Responding with choices:', choices);
      await interaction.respond(choices);
    } catch (error) {
      console.error('Error fetching threads:', error);
      await interaction.respond([]);
    }
  }
};

export default ThreadInfo;