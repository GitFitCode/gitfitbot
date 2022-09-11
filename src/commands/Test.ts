/**
 * Helper slash command for dev mode that does nothing in live.
 *
 * To trigger, type `/test` on the discord server.
 */

import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';

const Test: SlashCommand = {
  name: 'test',
  description: 'Helper slash command for dev mode that does nothing in live.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    const content = 'Test.';

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};

export default Test;
