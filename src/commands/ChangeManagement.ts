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
import { config } from 'gfc-vault-config';
import { COMMAND_FEATURE_CHANGE_MANAGEMENT, createNotionBacklogDBEntry } from '../utils';
import { SlashCommand } from '../Command';

async function executeRun(interaction: CommandInteraction) {
  // Snowflake structure received from get(), destructured and renamed.
  // https://discordjs.guide/slash-commands/parsing-options.html
  const { value: category } = interaction.options.get(
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
  const type = interaction.options.get(COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TYPE, false);
  const authorUsername = interaction.user.username;

  // Create an entry in the notion database and grab the page id.
  const pageID: string = await createNotionBacklogDBEntry(
    String(title),
    authorUsername,
    String(category),
    String(description),
    type ? String(type.value) : undefined,
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
      name: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TYPE,
      description: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TYPE_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TYPE_CHOICES,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default ChangeManagement;
