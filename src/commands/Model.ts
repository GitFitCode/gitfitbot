/**
 * Slash command to view or change the Claude model the bot uses for all LLM
 * calls (#question answers, /project-digest, the weekly pulse).
 *
 * `/model` — shows the current model.
 * `/model set:<tier>` — switches the active model (admins only). Resets to the
 * default (or ANTHROPIC_MODEL) on bot restart.
 */

import { ApplicationCommandOptionType, Client, CommandInteraction } from 'discord.js';
import 'dotenv/config';
import { SlashCommand } from '../Command';
import { COMMAND_MODEL, getActiveModel, setActiveModel } from '../utils';

const ADMIN_IDS = [process.env.ADMIN_1_DISCORD_ID, process.env.ADMIN_2_DISCORD_ID].filter(
  (id): id is string => Boolean(id),
);

async function executeRun(interaction: CommandInteraction) {
  const requested = interaction.options.get(COMMAND_MODEL.OPTION_SET)?.value as string | undefined;

  if (!requested) {
    await interaction.editReply(`Current model: \`${getActiveModel()}\``);
    return;
  }

  if (!ADMIN_IDS.includes(interaction.user.id)) {
    await interaction.editReply('Only admins can change the model.');
    return;
  }

  setActiveModel(requested);
  await interaction.editReply(`Model switched to \`${requested}\`.`);
}

const Model: SlashCommand = {
  name: COMMAND_MODEL.COMMAND_NAME,
  description: COMMAND_MODEL.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_MODEL.OPTION_SET,
      description: COMMAND_MODEL.OPTION_SET_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: COMMAND_MODEL.OPTION_SET_CHOICES,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Model;
