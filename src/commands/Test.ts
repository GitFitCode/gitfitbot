/**
 * Helper slash command for dev mode that does nothing in live.
 *
 * To trigger, type `/test` in the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';

require('@sentry/tracing');

const COMMAND_NAME = 'test';

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_NAME}`,
  });

  const content = 'Test.';
  await interaction.followUp({ ephemeral: true, content });

  transaction.finish();
  Sentry.setUser(null);
}

const Test: SlashCommand = {
  name: COMMAND_NAME,
  description: 'Helper slash command for dev mode that does nothing in live.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Test;
