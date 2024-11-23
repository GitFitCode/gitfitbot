/**
 * Helper slash command for creating a task in GFC backlog.
 *
 * To trigger, type `/backlog` in the discord server.
 */

import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import 'dotenv/config';
import { BACKLOG, createNotionBacklogDBEntry } from '../utils';
import { SlashCommand } from '../Command';

async function executeRun(interaction: CommandInteraction) {
  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/slash-commands/parsing-options.html
  const { value: categoryType } = interaction.options.get(BACKLOG.OPTION_CATEGORY, true);
  const { value: title } = interaction.options.get(BACKLOG.OPTION_TITLE, true);
  const { value: description } = interaction.options.get(BACKLOG.OPTION_DESCRIPTION, true);
  const { value: taskType } = interaction.options.get(BACKLOG.OPTION_TASK_TYPE, true);
  const authorUsername = interaction.user.username;

  const { value: priorityType } = interaction.options.get(BACKLOG.OPTION_PRIORITY, true);

  // Create an entry in the notion database and grab the page id.
  const pageID: string = await createNotionBacklogDBEntry(
    String(title),
    authorUsername,
    String(categoryType),
    String(description),
    String(taskType),
    String(priorityType),
  );

  if (pageID === '') {
    await interaction.followUp({
      ephemeral: true,
      content: 'Failed to create a backlog item!',
    });
    return;
  } else {
    // Notion link uses pageID without hyphens.
    const pageIDWithoutHyphens = pageID.replaceAll('-', '');
    const notionDatabaseLink = process.env.NOTION_BACKLOG_DATABASE_LINK;
    const notionURL = `${notionDatabaseLink}&p=${pageIDWithoutHyphens}`;

    const content = 'Backlog task created!';

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
}

const Backlog: SlashCommand = {
  name: BACKLOG.COMMAND_NAME,
  description: BACKLOG.COMMAND_DESCRIPTION,
  options: [
    {
      name: BACKLOG.OPTION_CATEGORY,
      description: BACKLOG.OPTION_CATEGORY_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: BACKLOG.OPTION_CATEGORY_CHOICES,
    },
    {
      name: BACKLOG.OPTION_TITLE,
      description: BACKLOG.OPTION_TITLE_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: BACKLOG.OPTION_DESCRIPTION,
      description: BACKLOG.OPTION_DESCRIPTION_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: BACKLOG.OPTION_TASK_TYPE,
      description: BACKLOG.OPTION_TYPE_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: BACKLOG.OPTION_TYPE_CHOICES,
    },
    {
      name: BACKLOG.OPTION_PRIORITY,
      description: BACKLOG.OPTION_PRIORITY_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: BACKLOG.OPTION_PRIORITY_CHOICES,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Backlog;
