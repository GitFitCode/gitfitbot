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
  AttachmentBuilder,
  AutocompleteInteraction,
  Client,
  CommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import 'dotenv/config';
import { SlashCommand } from '../Command';
import {
  buildTranscriptText,
  COMMAND_PROJECT_DIGEST,
  condenseMessages,
  fetchAllMessages,
  getProjectDigestResponse,
  GFC_PROJECTS_FORUM_ID,
  listForumThreads,
  upsertPostDigest,
} from '../utils';

const EMBED_DESCRIPTION_LIMIT = 4096;

/** Safe filename slug for the attached digest. */
function fileSlug(name: string): string {
  return (
    name
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'project'
  );
}

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
  // Build a clean embed + attach the full digest as a markdown file, instead of
  // dumping chunked text walls (which render poorly in Discord).
  const footerParts = [`${messages.length} messages`];
  if (truncated) footerParts.push('truncated to recent context');
  if (saved) footerParts.push(saved.linkedProjectId ? 'linked to a project' : 'not yet linked');

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`📋 Project Digest — ${channelName}`.slice(0, 256))
    .setDescription(
      digest.length > EMBED_DESCRIPTION_LIMIT
        ? `${digest.slice(0, EMBED_DESCRIPTION_LIMIT - 60)}\n\n*…full digest attached below.*`
        : digest,
    )
    .setFooter({ text: `${footerParts.join(' · ')}${saved ? ' · 💾 saved' : ''}` })
    .setTimestamp();

  const attachment = new AttachmentBuilder(
    Buffer.from(`# Project Digest — ${channelName}\n\n${digest}\n`, 'utf8'),
    { name: `${fileSlug(String(channelName))}-digest.md` },
  );

  await interaction.editReply({ content: '', embeds: [embed], files: [attachment] });
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
