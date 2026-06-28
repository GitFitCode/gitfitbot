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
  buildDigestPayload,
  COMMAND_PROJECT_DIGEST,
  DIGEST_INTERACTION,
  generateDigest,
  GFC_PROJECTS_FORUM_ID,
  listForumThreads,
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
  await interaction.editReply(
    `🧠 Digesting **${channelName}** (reading history + summarizing, this can take a moment)...`,
  );

  const result = await generateDigest(channel, targetId);
  if (result.empty) {
    await interaction.editReply(`**${channelName}** has no readable messages to digest.`);
    return;
  }

  await interaction.editReply({ content: '', ...buildDigestPayload(result, targetId) });

  // Add community sentiment reactions to the digest message.
  const reply = await interaction.fetchReply().catch(() => null);
  if (reply) {
    for (const emoji of DIGEST_INTERACTION.REACTIONS) {
      // eslint-disable-next-line no-await-in-loop
      await reply.react(emoji).catch(() => null);
    }
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
