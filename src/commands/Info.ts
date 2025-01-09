/**
 * Slash command that replies with the information of the server and the user who
 * triggered the command.
 *
 * To trigger, type `/info` in the discord server.
 */

import { CommandInteraction, Client } from 'discord.js';
import { version } from '../../package.json';
import { COMMAND_INFO, loadConfig } from '../utils';
import { SlashCommand } from '../Command';

async function executeRun(interaction: CommandInteraction) {
  const currentGuild = loadConfig(interaction.guildId!);
  const content = `\`Your username\`: ${interaction.user.username}
\`Your ID\`: ${interaction.user.id}
\`Server name\`: ${interaction.guild?.name}
\`Total members\`: ${interaction.guild?.memberCount}
\`${interaction.client.user.username} version\`: ${version} 
\`Current guild prefix\`: ${JSON.stringify(currentGuild.prefix)}`;

  await interaction.followUp({ ephemeral: true, content });
}

const Info: SlashCommand = {
  name: COMMAND_INFO.COMMAND_NAME,
  description: COMMAND_INFO.COMMAND_DESCRIPTION,
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Info;
