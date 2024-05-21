/**
 * Helper slash command for dev mode that does nothing in live.
 *
 * To trigger, type `/test` in the discord server.
 */

import { CommandInteraction, Client } from 'discord.js';
import { COMMAND_TEST } from '../utils';
import { SlashCommand } from '../Command';

async function executeRun(interaction: CommandInteraction) {
  const content = 'Test.';
  await interaction.followUp({ ephemeral: true, content });
}

const Test: SlashCommand = {
  name: COMMAND_TEST.COMMAND_NAME,
  description: COMMAND_TEST.COMMAND_DESCRIPTION,
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Test;
