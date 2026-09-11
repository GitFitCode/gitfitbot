import type { Client, CommandInteraction } from 'discord.js';
import type { SlashCommand } from '../Command';
import { COMMAND_PROJECT } from '../utils/constants';
import { getProjectSetupUrl } from '../utils/project';

const Project: SlashCommand = {
  name: COMMAND_PROJECT.COMMAND_NAME,
  description: COMMAND_PROJECT.COMMAND_DESCRIPTION,
  run: async (_client: Client, interaction: CommandInteraction) => {
    const setupUrl = getProjectSetupUrl();
    await interaction.reply({
      ephemeral: true,
      content: setupUrl ? 'Opening authenticated project setup…' : COMMAND_PROJECT.UNCONFIGURED_MESSAGE,
      fetchReply: true,
    });
    if (setupUrl) await interaction.editReply(`Open authenticated project setup: ${setupUrl}`);
  },
};

export default Project;
