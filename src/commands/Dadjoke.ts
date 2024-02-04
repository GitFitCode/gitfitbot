import * as Sentry from '@sentry/node';
import { Client, CommandInteraction } from 'discord.js';
import { request } from 'undici';
import { SlashCommand } from '../Command';
import { COMMAND_DADJOKE } from '../utils';

require('@sentry/tracing');

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_DADJOKE.COMMAND_NAME}`,
  });

  const URL = 'https://icanhazdadjoke.com';

  const response = await request(URL, { headers: { Accept: 'application/json' } });
  const responseJSON: any = await response.body.json();

  if (responseJSON.status === 200) {
    const content = responseJSON.joke;
    await interaction.followUp({ ephemeral: true, content });
  } else {
    const content = 'something went wrong';
    await interaction.followUp({ ephemeral: true, content });
  }

  transaction.finish();
  Sentry.setUser(null);
}

const Dadjoke: SlashCommand = {
  name: COMMAND_DADJOKE.COMMAND_NAME,
  description: COMMAND_DADJOKE.COMMAND_DESCRIPTION,
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Dadjoke;
