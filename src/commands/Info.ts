/**
 * Slash command that replies with the information of the server and the user who
 * triggered the command.
 *
 * To trigger, type `/info` on the discord server.
 */

import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';
import { version } from '../../package.json';

async function executeRun(interaction: CommandInteraction) {
  const content = `\`Your username\`: ${interaction.user.username}
\`Your ID\`: ${interaction.user.id}
\`Server name\`: ${interaction.guild?.name}
\`Total members\`: ${interaction.guild?.memberCount}
\`${interaction.client.user.username} version\`: ${version}`;

  await interaction.followUp({ ephemeral: true, content });
}

const Info: SlashCommand = {
  name: 'info',
  description: 'Displays info about yourself and the server.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Info;
