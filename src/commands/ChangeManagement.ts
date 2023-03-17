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
import { COMMAND_CHANGE_MANAGEMENT, createNotionBacklogDBEntry } from '../utils';
import { SlashCommand } from '../Command';

require('@sentry/tracing');

async function executeRun(interaction: CommandInteraction) {
  Sentry.setUser({
    id: interaction.user.id,
    username: interaction.user.username,
  });
  const transaction = Sentry.startTransaction({
    op: 'transaction',
    name: `/${COMMAND_CHANGE_MANAGEMENT.COMMAND_NAME}`,
  });

  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/slash-commands/parsing-options.html
  const { value: category } = interaction.options.get(
    COMMAND_CHANGE_MANAGEMENT.OPTION_CATEGORY,
    true,
  );
  const { value: title } = interaction.options.get(COMMAND_CHANGE_MANAGEMENT.OPTION_TITLE, true);
  const { value: description } = interaction.options.get(
    COMMAND_CHANGE_MANAGEMENT.OPTION_DESCRIPTION,
    true,
  );

  const authorUsername = interaction.user.username;

  transaction.setData(COMMAND_CHANGE_MANAGEMENT.OPTION_CATEGORY, String(category));
  transaction.setTag(COMMAND_CHANGE_MANAGEMENT.OPTION_CATEGORY, String(category));

  // Create an entry in the notion database and grab the page id.
  const pageID: string = await createNotionBacklogDBEntry(
    String(title),
    authorUsername,
    String(category),
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
  name: COMMAND_CHANGE_MANAGEMENT.COMMAND_NAME,
  description: 'Helper slash command for raising feature/change management requests.',
  options: [
    {
      name: COMMAND_CHANGE_MANAGEMENT.OPTION_CATEGORY,
      description: 'Category where to apply feature/change management requests.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        {
          name: 'GitFitCode (general)',
          value: 'gitfitcode-general',
        },
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
          name: 'Other',
          value: 'other',
        },
      ],
    },
    {
      name: COMMAND_CHANGE_MANAGEMENT.OPTION_TITLE,
      description: 'Title of the feature/change management request.',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: COMMAND_CHANGE_MANAGEMENT.OPTION_DESCRIPTION,
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
