import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  CommandInteraction,
} from 'discord.js';
import { SlashCommand } from '../Command';
import { getProjectInitUrl, ProjectInitConfigurationError } from '../utils/projectInit';

const Project: SlashCommand = {
  name: 'project',
  description: 'Start project onboarding in the GitFitCode hub.',
  dmPermission: false,
  options: [
    { type: 1, name: 'init', description: 'Open the authenticated project onboarding flow.' },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    if (!interaction.guildId) {
      await interaction.reply({
        ephemeral: true,
        content: 'Project onboarding is available from a GitFitCode server.',
      });
      return;
    }
    if ((interaction as ChatInputCommandInteraction).options.getSubcommand(false) !== 'init') {
      await interaction.reply({ ephemeral: true, content: 'Unsupported project action.' });
      return;
    }
    try {
      const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Continue in hub')
        .setURL(getProjectInitUrl());
      await interaction.reply({
        ephemeral: true,
        content: 'Continue in the GitFitCode hub to sign in, review, and save your project setup.',
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      });
    } catch (error) {
      if (error instanceof ProjectInitConfigurationError) {
        await interaction.reply({
          ephemeral: true,
          content:
            'Project onboarding is temporarily unavailable. Please contact an administrator.',
        });
        return;
      }
      throw error;
    }
  },
};

export default Project;
