/**
 * Helper slash command for dev mode that does nothing in live.
 *
 * To trigger, type `/test` on the discord server.
 */

import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { SlashCommand } from '../Command';

async function executeRun(interaction: CommandInteraction) {
  const content = 'Test.';

  await interaction.followUp({ ephemeral: true, content });
}

const Test: SlashCommand = {
  name: 'test',
  description: 'Helper slash command for dev mode that does nothing in live.',
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'test',
      description: 'test option',
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Test;
