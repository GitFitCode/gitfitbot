/**
 * Helper slash command for raising feature/change management requests.
 *
 * To trigger, type `/feature-cm` in the discord server.
 */

import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import 'dotenv/config';
import { COMMAND_FEATURE_CHANGE_MANAGEMENT, createNotionBacklogDBEntry } from '../utils';
import { SlashCommand } from '../Command';

async function executeRun(interaction: CommandInteraction) {
  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/slash-commands/parsing-options.html
  const { value: categoryType } = interaction.options.get(
    COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_CATEGORY,
    true,
  );
  const { value: title } = interaction.options.get(
    COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TITLE,
    true,
  );
  const { value: description } = interaction.options.get(
    COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_DESCRIPTION,
    true,
  );
  const { value: taskType } = interaction.options.get(
    COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TASK_TYPE,
    true,
  );
  const authorUsername = interaction.user.username;

  const { value: priorityType } = interaction.options.get(
    COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_PRIORITY,
    true,
  );

  // Create an entry in the notion database and grab the page id.
  const pageID: string = await createNotionBacklogDBEntry(
    String(title),
    authorUsername,
    String(categoryType),
    String(description),
    String(taskType),
    String(priorityType),
  );

  // Notion link uses pageID without hyphens.
  const pageIDWithoutHyphens = pageID.replaceAll('-', '');
  const notionDatabaseLink = process.env.NOTION_BACKLOG_DATABASE_LINK;
  const notionURL = `${notionDatabaseLink}&p=${pageIDWithoutHyphens}`;

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
}

const ChangeManagement: SlashCommand = {
  name: COMMAND_FEATURE_CHANGE_MANAGEMENT.COMMAND_NAME,
  description: COMMAND_FEATURE_CHANGE_MANAGEMENT.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_CATEGORY,
      description: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_CATEGORY_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_CATEGORY_CHOICES,
    },
    {
      name: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TITLE,
      description: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TITLE_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_DESCRIPTION,
      description: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_DESCRIPTION_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TASK_TYPE,
      description: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TYPE_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TYPE_CHOICES,
    },
    {
      name: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_PRIORITY,
      description: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_PRIORITY_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_PRIORITY_CHOICES,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default ChangeManagement;
