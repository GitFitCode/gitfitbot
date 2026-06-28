/**
 * Slash command that summarizes a `gfc-projects` thread into a structured
 * digest + reusable playbook, and posts it back into the thread.
 *
 * This is the "systematize community projects" feature: point it at any project
 * thread and get a repeatable case study (what it is, stack, timeline, process,
 * playbook, open threads) so the lessons can be applied to the next project.
 *
 * To trigger, type `/project-digest` in (or referencing) a project thread.
 */

import { ApplicationCommandOptionType, Client, CommandInteraction } from 'discord.js';
import 'dotenv/config';
import { SlashCommand } from '../Command';
import {
  buildTranscriptText,
  chunkForDiscord,
  COMMAND_PROJECT_DIGEST,
  condenseMessages,
  fetchAllMessages,
  getProjectDigestResponse,
} from '../utils';

async function executeRun(interaction: CommandInteraction) {
  const requestedId = interaction.options.get(COMMAND_PROJECT_DIGEST.OPTION_THREAD_ID)?.value as
    | string
    | undefined;
  const targetId = requestedId ?? interaction.channelId;

  const channel = await interaction.client.channels.fetch(targetId).catch(() => null);
  if (!channel || !('messages' in channel)) {
    await interaction.editReply(
      `Could not read channel/thread \`${targetId}\` — make sure the ID is valid and the bot can see it.`,
    );
    return;
  }

  const channelName = 'name' in channel ? (channel.name ?? targetId) : targetId;
  await interaction.editReply(`📥 Reading history of **${channelName}**...`);

  const messages = await fetchAllMessages(channel);
  if (messages.length === 0) {
    await interaction.editReply(`**${channelName}** has no readable messages to digest.`);
    return;
  }

  await interaction.editReply(
    `🧠 Digesting **${messages.length}** messages from **${channelName}** (this can take a moment)...`,
  );

  const { text, truncated } = buildTranscriptText(condenseMessages(messages));
  const digest = await getProjectDigestResponse(text);

  const header =
    `# 📋 Project Digest — ${channelName}\n` +
    `_${messages.length} messages${truncated ? ', transcript truncated to most recent context' : ''}_\n`;

  const chunks = chunkForDiscord(`${header}\n${digest}`);

  // First chunk replaces the deferred reply; the rest are follow-ups so the
  // whole digest threads together in order.
  await interaction.editReply(chunks[0]);
  for (const chunk of chunks.slice(1)) {
    // eslint-disable-next-line no-await-in-loop
    await interaction.followUp(chunk);
  }
}

const ProjectDigest: SlashCommand = {
  name: COMMAND_PROJECT_DIGEST.COMMAND_NAME,
  description: COMMAND_PROJECT_DIGEST.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_PROJECT_DIGEST.OPTION_THREAD_ID,
      description: COMMAND_PROJECT_DIGEST.OPTION_THREAD_ID_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: false,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default ProjectDigest;
