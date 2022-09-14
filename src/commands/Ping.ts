/**
 * Slash command that replies with "Pong!" when triggered.
 *
 * To trigger, type `/ping` on the discord server.
 */

import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';

async function executeRun(client: Client, interaction: CommandInteraction) {
  const sent = await interaction.followUp({
    ephemeral: true,
    content: 'Pinging...',
    fetchReply: true,
  });
  interaction.editReply(
    `Websocket heartbeat: ${client.ws.ping}ms\nRoundtrip latency: ${
      sent.createdTimestamp - interaction.createdTimestamp
    }ms`,
  );
}

const Ping: SlashCommand = {
  name: 'ping',
  description: 'Check whether the bot is working.',
  run: async (client: Client, interaction: CommandInteraction) => {
    await executeRun(client, interaction);
  },
};

export default Ping;
