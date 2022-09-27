/**
 * Slash command that checks whether the bot is alive when triggered.
 *
 * To trigger, type `/ping` on the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';

require('@sentry/tracing');

async function executeRun(client: Client, interaction: CommandInteraction) {
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/ping',
  });

  const sent = await interaction.followUp({
    ephemeral: true,
    content: 'Pinging...',
    fetchReply: true,
  });

  await interaction.editReply(
    `Websocket heartbeat: ${client.ws.ping}ms\nRoundtrip latency: ${
      sent.createdTimestamp - interaction.createdTimestamp
    }ms`,
  );

  transaction.finish();
}

const Ping: SlashCommand = {
  name: 'ping',
  description: 'Check whether the bot is working.',
  run: async (client: Client, interaction: CommandInteraction) => {
    await executeRun(client, interaction);
  },
};

export default Ping;
