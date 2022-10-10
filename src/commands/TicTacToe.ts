/**
 * Slash command that starts a tictactoe game when triggered.
 *
 * To trigger, type `/tictactoe` in the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { SlashCommand } from '../Command';

require('@sentry/tracing');
const TTT = require('discord-tictactoe');

const game = new TTT({ language: 'en' });

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/tictactoe',
  });

  // Try & catch required for empty input here due to `opponent` option being optional.
  try {
    const { value: opponent } = interaction.options.get('opponent', true);

    transaction.setData('opponent', String(opponent));
    transaction.setTag('opponent', String(opponent));
  } catch (error: any) {
    if (error.code === 'CommandInteractionOptionNotFound') {
      transaction.setData('opponent', 'AI');
      transaction.setTag('opponent', 'AI');
    }
  } finally {
    game.handleInteraction(interaction);

    transaction.finish();
    Sentry.setUser(null);
  }
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
