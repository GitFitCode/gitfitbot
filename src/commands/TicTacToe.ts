/**
 * Slash command that starts a tictactoe game when triggered.
 *
 * To trigger, type `/tictactoe` in the discord server.
 */

import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { COMMAND_TICTACTOE } from '../utils';
import { SlashCommand } from '../Command';

const TTT = require('discord-tictactoe');

const game = new TTT({ language: 'en' });

async function executeRun(interaction: CommandInteraction) {
  game.handleInteraction(interaction);
}

const TicTacToe: SlashCommand = {
  name: COMMAND_TICTACTOE.COMMAND_NAME,
  description: COMMAND_TICTACTOE.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_TICTACTOE.OPTION_OPPONENT,
      description: COMMAND_TICTACTOE.OPTION_OPPONENT_DESCRIPTION,
      type: ApplicationCommandOptionType.User,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default TicTacToe;
