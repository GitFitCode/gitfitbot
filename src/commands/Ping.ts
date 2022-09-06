/**
 * Slash command that replies with "Pong!" when triggered.
 *
 * To trigger, type `/ping` on the discord server.
 */

import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';

const Ping: SlashCommand = {
  name: 'ping',
  description: 'Returns Pong!',
  run: async (_client: Client, interaction: CommandInteraction) => {
    const content = 'Pong!';

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};

export default Ping;
