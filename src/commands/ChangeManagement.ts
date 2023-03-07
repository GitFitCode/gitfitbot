/**
 * Helper slash command for raising feature/change management requests.
 *
 * To trigger, type `/feature-cm` in the discord server.
 */

import * as Sentry from '@sentry/node';
import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { config } from 'gfc-vault-config';
import { createNotionBacklogDBEntry } from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: '/feature-cm',
  });

  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/slash-commands/parsing-options.html
  const { value: process } = interaction.options.get('process', true);
  const { value: title } = interaction.options.get('title', true);
  const { value: description } = interaction.options.get('description', true);

  const authorUsername = interaction.user.username;

  transaction.setData('process', String(process));
  transaction.setTag('process', String(process));

  // Create an entry in the notion database and grab the page id.
  const pageID: string = await createNotionBacklogDBEntry(
    String(title),
    authorUsername,
    String(process),
    String(description),
  );

  // Notion link uses pageID without hyphens.
  const pageIDWithoutHyphens = pageID.replaceAll('-', '');
  const notionURL = `${config.notionBacklogDatabaseLink}&p=${pageIDWithoutHyphens}`;

  const content = 'Feature/change management request sent!';

  await interaction.followUp({
    ephemeral: true,
    content,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            url: notionURL,
            label: 'Notion Link',
          },
        ],
      },
    ],
  });

  transaction.finish();
  Sentry.setUser(null);
}

const ChangeManagement: SlashCommand = {
  name: 'feature-cm',
  description: 'Helper slash command for raising feature/change management requests.',
  options: [
    {
      name: 'process',
      description: 'Process where to apply feature/change management requests.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        {
          name: 'Discord Server',
          value: 'discord-server',
        },
        {
          name: 'Discord Bot',
          value: 'discord-bot',
        },
        {
          name: 'Notion',
          value: 'notion',
        },
        {
          name: 'GitHub',
          value: 'github',
        },
        {
          name: 'Other (mention in title/description)',
          value: 'other',
        },
      ],
    },
    {
      name: 'title',
      description: 'title of the feature/change management request.',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: 'description',
      description: 'Description of the feature/change management request.',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default ChangeManagement;
