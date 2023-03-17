/**
 * Slash command that replies with the information of the server and the user who
 * triggered the command.
 *
 * To trigger, type `/info` in the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client } from 'discord.js';
import { version } from '../../package.json';
import { COMMAND_INFO } from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_INFO.COMMAND_NAME}`,
  });

  const content = `\`Your username\`: ${interaction.user.username}
\`Your ID\`: ${interaction.user.id}
\`Server name\`: ${interaction.guild?.name}
\`Total members\`: ${interaction.guild?.memberCount}
\`${interaction.client.user.username} version\`: ${version}`;

  await interaction.followUp({ ephemeral: true, content });

  transaction.finish();
  Sentry.setUser(null);
}

const Info: SlashCommand = {
  name: COMMAND_INFO.COMMAND_NAME,
  description: 'Displays info about yourself and the server.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Info;
