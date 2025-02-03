/**
 * Slash command that captures standup update from the user and replies with that information
 *
 * To trigger, type `/standup` in the discord server.
 */

import {
  ActionRowBuilder,
  Client,
  CommandInteraction,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { SlashCommand } from '../Command';
import { COMMAND_STANDUP } from '../utils';

async function executeRun(interaction: CommandInteraction) {
  // Create the modal
  const modal = new ModalBuilder()
    .setCustomId(COMMAND_STANDUP.MODAL_CUSTOM_ID)
    .setTitle(COMMAND_STANDUP.MODAL_TITLE);

  // Add components to the modal
  const yesterdayInput = new TextInputBuilder()
    .setCustomId(COMMAND_STANDUP.YESTERDAY_INPUT_CUSTOM_ID)
    .setLabel(COMMAND_STANDUP.YESTERDAY_LABEL)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const todayInput = new TextInputBuilder()
    .setCustomId(COMMAND_STANDUP.TODAY_INPUT_CUSTOM_ID)
    .setLabel(COMMAND_STANDUP.TODAY_LABEL)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const blockersInput = new TextInputBuilder()
    .setCustomId(COMMAND_STANDUP.BLOCKERS_INPUT_CUSTOM_ID)
    .setLabel(COMMAND_STANDUP.BLOCKERS_LABEL)
    .setStyle(TextInputStyle.Paragraph)
    .setValue(COMMAND_STANDUP.BLOCKERS_DEFAULT_VALUE)
    .setRequired(true);

  // An action row only holds one text input, so we need one action row per text input.
  const yesterdayActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    yesterdayInput,
  );
  const todayActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    todayInput,
  );
  const blockersActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    blockersInput,
  );

  // Add inputs to the modal
  modal.addComponents(yesterdayActionRow, todayActionRow, blockersActionRow);

  // Show the modal to the user
  await interaction.showModal(modal);
}

const Standup: SlashCommand = {
  name: COMMAND_STANDUP.COMMAND_NAME,
  description: COMMAND_STANDUP.COMMAND_DESCRIPTION,
  run: async (_client: Client, interaction: CommandInteraction) => {
    await executeRun(interaction);
  },
};

export default Standup;
