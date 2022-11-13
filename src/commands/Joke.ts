/**
 * Slash command that replies with a joke from https://jokeapi.dev/ when triggered.
 *
 * To trigger, type `/joke` in the discord server.
 */

import * as Sentry from '@sentry/node';
import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { request } from 'undici';
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
    name: '/joke',
  });

  // Try & catch required for empty input here due to `category` option being optional.
  try {
    // Snowflake structure received from get(), destructured and renamed.
    // https://discordjs.guide/slash-commands/parsing-options.html
    const { value: chosenCategory } = interaction.options.get('category', true);

    transaction.setData('category', String(chosenCategory));
    transaction.setTag('category', String(chosenCategory));

    await sendJoke(interaction, String(chosenCategory));
  } catch (error: any) {
    if (error.code === 'CommandInteractionOptionNotFound') {
      // None of the options were selected.

      const chosenCategory: string = 'Any';

      transaction.setData('category', String(chosenCategory));
      transaction.setTag('category', String(chosenCategory));

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
  name: 'joke',
  description: 'Replies with a joke from https://jokeapi.dev/',
  options: [
    {
      name: 'category',
      description: 'choose a category',
      type: ApplicationCommandOptionType.String,
      choices: [
        { name: 'Programming', value: 'programming' },
        { name: 'Miscellaneous', value: 'misc' },
        { name: 'Dark', value: 'dark' },
        { name: 'Pun', value: 'pun' },
        { name: 'Spooky', value: 'spooky' },
        { name: 'Christmas', value: 'christmas' },
      ],
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Joke;
