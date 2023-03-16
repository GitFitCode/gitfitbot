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

const COMMAND_NAME = 'tictactoe';
const OPTION_OPPONENT = 'opponent';
const game = new TTT({ language: 'en' });

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_NAME}`,
  });

  // Try & catch required for empty input here due to `opponent` option being optional.
  try {
    const { value: opponent } = interaction.options.get(OPTION_OPPONENT, true);

    transaction.setData(OPTION_OPPONENT, String(opponent));
    transaction.setTag(OPTION_OPPONENT, String(opponent));
  } catch (error: any) {
    if (error.code === 'CommandInteractionOptionNotFound') {
      transaction.setData(OPTION_OPPONENT, 'AI');
      transaction.setTag(OPTION_OPPONENT, 'AI');
    }
  } finally {
    game.handleInteraction(interaction);

    transaction.finish();
    Sentry.setUser(null);
  }
}

const TicTacToe: SlashCommand = {
  name: COMMAND_NAME,
  description: 'Starts a game of TicTacToe.',
  options: [
    {
      name: OPTION_OPPONENT,
      description: '@ your opponent',
      type: ApplicationCommandOptionType.User,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default TicTacToe;
