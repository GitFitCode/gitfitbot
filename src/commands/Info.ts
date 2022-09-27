/**
 * Slash command that replies with the information of the server and the user who
 * triggered the command.
 *
 * To trigger, type `/info` on the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';
import { version } from '../../package.json';

require('@sentry/tracing');

async function executeRun(interaction: CommandInteraction) {
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/info',
  });

  const content = `\`Your username\`: ${interaction.user.username}
\`Your ID\`: ${interaction.user.id}
\`Server name\`: ${interaction.guild?.name}
\`Total members\`: ${interaction.guild?.memberCount}
\`${interaction.client.user.username} version\`: ${version}`;

  await interaction.followUp({ ephemeral: true, content });

  transaction.finish();
}

const Info: SlashCommand = {
  name: 'info',
  description: 'Displays info about yourself and the server.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Info;
