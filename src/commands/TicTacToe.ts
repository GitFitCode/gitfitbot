/**
 * Slash command that starts a tictactoe game when triggered.
 *
 * To trigger, type `/tictactoe` on the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { SlashCommand } from '../Command';

require('@sentry/tracing');
const TTT = require('discord-tictactoe');

const game = new TTT({ language: 'en' });

async function executeRun(interaction: CommandInteraction) {
  Sentry.configureScope((scope) => {
    scope.setUser({
      id: interaction.user.id,
      username: interaction.user.username,
    });
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/tictactoe',
  });

  game.handleInteraction(interaction);

  transaction.finish();
  Sentry.setUser(null);
}

const TicTacToe: SlashCommand = {
  name: 'tictactoe',
  description: 'Starts a game of TicTacToe.',
  options: [
    {
      name: 'opponent',
      description: '@ your opponent',
      type: ApplicationCommandOptionType.User,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default TicTacToe;
