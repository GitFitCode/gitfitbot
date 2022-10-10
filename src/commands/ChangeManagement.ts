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
import { createNotionBacklogDBEntry } from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');
require('dotenv').config();
const config = require('gfc-vault-config');

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
  // https://discordjs.guide/interactions/slash-commands.html#parsing-options
  const { value: process } = interaction.options.get('process', true);
  const { value: summary } = interaction.options.get('summary', true);

  const authorUsername = interaction.user.username;

  transaction.setData('process', String(process));
  transaction.setTag('process', String(process));

  // Create an entry in the notion database and grab the page id.
  const pageID: string = await createNotionBacklogDBEntry(
    String(summary),
    authorUsername,
    String(process),
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
          name: 'Other (mention in summary)',
          value: 'other',
        },
      ],
    },
    {
      name: 'summary',
      description: 'Summary of the feature/change management request (max length = 100).',
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 100,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default ChangeManagement;
