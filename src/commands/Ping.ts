/**
 * Slash command that checks whether the bot is alive when triggered.
 *
 * To trigger, type `/ping` in the discord server.
 */

import { CommandInteraction, Client } from 'discord.js';
import { COMMAND_PING } from '../utils';
import { SlashCommand } from '../Command';

async function executeRun(client: Client, interaction: CommandInteraction) {
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
}

const Ping: SlashCommand = {
  name: COMMAND_PING.COMMAND_NAME,
  description: COMMAND_PING.COMMAND_DESCRIPTION,
  run: async (client: Client, interaction: CommandInteraction) => {
    await executeRun(client, interaction);
  },
};

export default Ping;
