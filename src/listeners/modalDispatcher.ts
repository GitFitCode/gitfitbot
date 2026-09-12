import { CacheType, ModalSubmitInteraction } from 'discord.js';
import { COMMAND_STANDUP } from '../utils';

export async function handleModalSubmission(
  interaction: ModalSubmitInteraction<CacheType>,
): Promise<void> {
  if (interaction.customId !== COMMAND_STANDUP.MODAL_CUSTOM_ID) return;
  const yesterday = interaction.fields.getTextInputValue(COMMAND_STANDUP.YESTERDAY_INPUT_CUSTOM_ID);
  const today = interaction.fields.getTextInputValue(COMMAND_STANDUP.TODAY_INPUT_CUSTOM_ID);
  const blockers = interaction.fields.getTextInputValue(COMMAND_STANDUP.BLOCKERS_INPUT_CUSTOM_ID);
  await interaction.reply(
    `<@${interaction.user.id}>'s Update:\n**Yesterday:**\n${yesterday}\n\n**Today:**\n${today}\n\n**Blockers:**\n${blockers}`,
  );
}
