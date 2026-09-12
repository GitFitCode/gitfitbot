/**
 * "interactionCreate" event listener for the bot.
 */

import { Client, Interaction, InteractionType } from 'discord.js';
import Commands from '../Commands';
import { handleDigestButton, handleDigestModal } from '../utils';
import { handleSlashCommand } from './interactionDispatcher';
import { handleModalSubmission } from './modalDispatcher';

export default (client: Client): void => {
  client.on('interactionCreate', async (interaction: Interaction) => {
    // Route autocomplete interactions to the matching command's handler.
    if (interaction.isAutocomplete()) {
      const slashCommand = Commands.find((c) => c.name === interaction.commandName);
      if (slashCommand?.autocomplete) {
        await slashCommand.autocomplete(client, interaction);
      }
      return;
    }

    // Digest correction/feedback buttons.
    if (interaction.isButton() && interaction.customId.startsWith('digest:')) {
      await handleDigestButton(interaction);
      return;
    }

    // Digest correction/feedback modal submissions.
    if (interaction.isModalSubmit() && interaction.customId.startsWith('digest:')) {
      await handleDigestModal(interaction);
      return;
    }

    // Check if interaction is a command and call handleSlashCommand() if so.
    if (interaction.type === InteractionType.ApplicationCommand) {
      await handleSlashCommand(client, interaction, Commands);
    }

    // Check if interaction is a modal submission and call handleModalSubmission() if so.
    if (interaction.type === InteractionType.ModalSubmit) {
      await handleModalSubmission(interaction);
    }
  });
};
