/**
 * Slash command that summarizes a `gfc-projects` thread into a structured
 * digest + reusable playbook, and posts it back.
 *
 * Usage:
 *   - Run `/project-digest` inside a project thread → digests that thread.
 *   - Run it anywhere (incl. DMs) and use the `project` option → a searchable
 *     dropdown of project threads by name (autocomplete).
 */

import {
  ApplicationCommandOptionType,
  AutocompleteInteraction,
  Client,
  CommandInteraction,
} from 'discord.js';
import 'dotenv/config';
import { SlashCommand } from '../Command';
import {
  buildTranscriptText,
  chunkForDiscord,
  COMMAND_PROJECT_DIGEST,
  condenseMessages,
  fetchAllMessages,
  getProjectDigestResponse,
  GFC_PROJECTS_FORUM_ID,
  listForumThreads,
  upsertPostDigest,
} from '../utils';

async function executeRun(interaction: CommandInteraction) {
  const requestedId = interaction.options.get(COMMAND_PROJECT_DIGEST.OPTION_PROJECT)?.value as
    | string
    | undefined;
  const targetId = requestedId ?? interaction.channelId;

  const channel = await interaction.client.channels.fetch(targetId).catch(() => null);

  // No project picked and not run inside a thread → tell them how to pick one.
  if (!requestedId && (!channel || !channel.isThread())) {
    await interaction.editReply(
      'Run this **inside a project thread**, or use the `project` option to pick one by name.',
    );
    return;
  }

  if (!channel || !('messages' in channel)) {
    await interaction.editReply(
      `Could not read that thread — make sure the bot can see it (\`${targetId}\`).`,
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

  // Persist the digest (1 post = 1 row in discord_post_digests).
  const saved = await upsertPostDigest({
    discordPostId: targetId,
    guildId: interaction.guildId,
    name: String(channelName),
    digest,
    messageCount: messages.length,
  });
  const savedNote = saved
    ? `\n\n_💾 Saved to projects DB${saved.linkedProjectId ? ' · linked to a conduit project' : ' · not yet linked to a project'}._`
    : '';

  const header =
    `# 📋 Project Digest — ${channelName}\n` +
    `_${messages.length} messages${truncated ? ', transcript truncated to most recent context' : ''}_\n`;

  const chunks = chunkForDiscord(`${header}\n${digest}${savedNote}`);

  // First chunk replaces the deferred reply; the rest are follow-ups so the
  // whole digest threads together in order.
  await interaction.editReply(chunks[0]);
  for (const chunk of chunks.slice(1)) {
    // eslint-disable-next-line no-await-in-loop
    await interaction.followUp(chunk);
  }
}

/** Autocomplete: searchable list of gfc-projects threads by name. */
async function autocomplete(_client: Client, interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toString().toLowerCase();

  let threads: { id: string; name: string }[] = [];
  try {
    threads = await listForumThreads(interaction.client, GFC_PROJECTS_FORUM_ID);
  } catch {
    /* respond empty on failure rather than erroring the interaction */
  }

  const choices = threads
    .filter((t) => !focused || t.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((t) => ({ name: t.name.slice(0, 100), value: t.id }));

  await interaction.respond(choices);
}

const ProjectDigest: SlashCommand = {
  name: COMMAND_PROJECT_DIGEST.COMMAND_NAME,
  description: COMMAND_PROJECT_DIGEST.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_PROJECT_DIGEST.OPTION_PROJECT,
      description: COMMAND_PROJECT_DIGEST.OPTION_PROJECT_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
  autocomplete,
};

export default ProjectDigest;
