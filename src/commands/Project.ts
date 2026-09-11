import type { Client, CommandInteraction } from 'discord.js';
import type { SlashCommand } from '../Command';
import { getProjectSetupUrl } from '../utils/project.ts';

const COMMAND_PROJECT = {
  COMMAND_NAME: 'project',
  COMMAND_DESCRIPTION: 'Open authenticated project setup in the GitFitCode hub.',
  UNCONFIGURED_MESSAGE: 'Project setup is temporarily unavailable: the hub public origin is not configured.',
};

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
