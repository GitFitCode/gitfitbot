/**
 * Slash command that replies with a joke from https://jokeapi.dev/ when triggered.
 *
 * To trigger, type `/joke` on the discord server.
 */

import { CommandInteraction, Client, ApplicationCommandOptionType } from 'discord.js';
import { request } from 'undici';
import { SlashCommand } from '../Command';

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

  // Check if the joke is a twopart.
  if (jokeJSON.type === 'twopart') {
    // JOKE IS A TWOPART

    content = `${jokeJSON.setup}\n||${jokeJSON.delivery}||`;
  } else {
    // JOKE IS A SINGLE

    content = `${jokeJSON.joke}`;
  }

  await interaction.followUp({ ephemeral: true, content });
}

async function executeRun(interaction: CommandInteraction) {
  // Try & catch required for empty input here due to `category` option being optional.
  try {
    const { value: chosenCategory } = interaction.options.get('category', true);

    // Check if the type of chosenCategory is string.
    if (typeof chosenCategory === 'string') {
      // TYPE OF chosenCategory IS STRING

      await sendJoke(interaction, chosenCategory);
    } else {
      // TYPE OF chosenCategory IS NOT STRING
      // NO-OP
    }
  } catch (error: any) {
    if (error.code === 'CommandInteractionOptionNotFound') {
      // None of the options were selected.

      const chosenCategory: string = 'Any';
      await sendJoke(interaction, chosenCategory);
    } else {
      console.log(error.body);
    }
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
