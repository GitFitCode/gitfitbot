/**
 * Slash command that replies with a joke from https://jokeapi.dev/ when triggered.
 *
 * To trigger, type `/joke` in the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { request } from 'undici';
import { COMMAND_JOKE } from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');

/**
 * Function to query the joke api and send a joke to the discord server.
 * @param interaction CommandInteraction
 * @param chosenCategory Joke category chosen by the user.
 */
async function sendJoke(interaction: CommandInteraction, chosenCategory: string) {
  // https://jokeapi.dev/, https://rapidapi.com/Sv443/api/jokeapi-v2/
  const URL = `https://v2.jokeapi.dev/joke/${chosenCategory}?blacklistFlags=nsfw,religious,political,racist,sexist,explicit`;

  // Make a request to URL and grab the response.
  const response = await request(URL);
  const jokeJSON = await response.body.json();
  let content = "I'm back!";

  // Check if the joke is twopart.
  if (jokeJSON.type === 'twopart') {
    // JOKE IS TWOPART

    content = `${jokeJSON.setup}\n||${jokeJSON.delivery}||`;
  } else {
    // JOKE IS SINGLE

    content = `${jokeJSON.joke}`;
  }
  await interaction.followUp({ ephemeral: true, content });
}

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_JOKE.COMMAND_NAME}`,
  });

  // Try & catch required for empty input here due to `category` option being optional.
  try {
    // Snowflake structure received from get(), destructured and renamed.
    // https://discordjs.guide/slash-commands/parsing-options.html
    const { value: chosenCategory } = interaction.options.get(COMMAND_JOKE.OPTION_CATEGORY, true);

    transaction.setData(COMMAND_JOKE.OPTION_CATEGORY, String(chosenCategory));
    transaction.setTag(COMMAND_JOKE.OPTION_CATEGORY, String(chosenCategory));

    await sendJoke(interaction, String(chosenCategory));
  } catch (error: any) {
    if (error.code === 'CommandInteractionOptionNotFound') {
      // None of the options were selected.

      const chosenCategory: string = 'Any';

      transaction.setData(COMMAND_JOKE.OPTION_CATEGORY, String(chosenCategory));
      transaction.setTag(COMMAND_JOKE.OPTION_CATEGORY, String(chosenCategory));

      await sendJoke(interaction, chosenCategory);
    } else {
      console.error(error);
      Sentry.captureException(error);
    }
  } finally {
    transaction.finish();
    Sentry.setUser(null);
  }
}

const Joke: SlashCommand = {
  name: COMMAND_JOKE.COMMAND_NAME,
  description: 'Replies with a joke from https://jokeapi.dev/',
  options: [
    {
      name: COMMAND_JOKE.OPTION_CATEGORY,
      description: 'choose a category',
      type: ApplicationCommandOptionType.String,
      choices: COMMAND_JOKE.OPTION_CATEGORY_CHOICES,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Joke;
