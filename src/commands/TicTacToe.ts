/**
 * Slash command that starts a tictactoe game when triggered.
 *
 * To trigger, type `/tictactoe` on the discord server.
 */

import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { SlashCommand } from '../Command';

const TTT = require('discord-tictactoe');

const game = new TTT({ language: 'en' });

async function executeRun(interaction: CommandInteraction) {
  game.handleInteraction(interaction);
}

const TicTacToe: SlashCommand = {
  name: 'tictactoe',
  description: 'Starts a game of TicTacToe.',
  options: [
    {
      name: 'opponent',
      description: '@ your opponent',
      type: ApplicationCommandOptionType.User,
      required: false,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default TicTacToe;
