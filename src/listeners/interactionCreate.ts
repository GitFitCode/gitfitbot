/* eslint-disable object-curly-newline */

/**
 * "interactionCreate" event listener for the bot.
 */

import {
  CommandInteraction,
  Client,
  Interaction,
  InteractionType,
  CacheType,
  ModalSubmitInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import Commands from '../Commands';
import { COMMAND_STANDUP } from '../utils';
import ThreadInfo from '../commands/ThreadInfo';
// All commands that invoke a modal should be listed here.
const dontDeferCommandsList = [COMMAND_STANDUP.COMMAND_NAME];

/**
 * Handles slash command interactions.
 *
 * This function is triggered when a slash command is used in Discord. If the command is found, it defers the reply
 * to keep the interaction token valid for long-running tasks and then runs the command. If any error
 * occurs during the execution, it captures and logs the error.
 *
 * @param {Client} client - The Discord client.
 * @param {CommandInteraction} interaction - The interaction object representing the slash command.
 */
const handleSlashCommand = async (
  client: Client,
  interaction: CommandInteraction,
): Promise<void> => {
  const slashCommand = Commands.find((c) => c.name === interaction.commandName);
  if (!slashCommand) {
    interaction.followUp({ content: 'An error has occurred' });
    return;
  }

  // Ensure interaction token remains valid for long running tasks.
  // https://discordjs.guide/slash-commands/response-methods.html#deferred-responses
  if (!dontDeferCommandsList.includes(interaction.commandName)) {
    await interaction.deferReply();
  }

  slashCommand.run(client, interaction);
};

/**
 * Handles the modal submission for the standup command.
 *
 * This function processes the modal submission for the standup command, extracting the user's input
 * for yesterday's, today's activities, and any blockers. It then formats and sends a reply to the user
 * with the provided information.
 *
 * @param {ModalSubmitInteraction<CacheType>} interaction - The interaction object containing the user's input.
 */
const handleModalSubmission = async (interaction: ModalSubmitInteraction<CacheType>) => {
  // Check if the modal submission is for the standup command.
  if (interaction.customId === COMMAND_STANDUP.MODAL_CUSTOM_ID) {
    // Retrieve data entered by the user in the modal's text input fields.
    const yesterday = interaction.fields.getTextInputValue(
      COMMAND_STANDUP.YESTERDAY_INPUT_CUSTOM_ID,
    );
    const today = interaction.fields.getTextInputValue(COMMAND_STANDUP.TODAY_INPUT_CUSTOM_ID);
    const blockers = interaction.fields.getTextInputValue(COMMAND_STANDUP.BLOCKERS_INPUT_CUSTOM_ID);

    // Format the reply content with the user's updates.
    const content = `<@${interaction.user.id}>'s Update:\n**Yesterday:**\n${yesterday}\n\n**Today:**\n${today}\n\n**Blockers:**\n${blockers}`;

    // Send the formatted content as a reply to the user.
    await interaction.reply(content);
  }
};

export default (client: Client): void => {
  client.on('interactionCreate', async (interaction: Interaction) => {
    // Check if interaction is a command and call handleSlashCommand() if so.
    if (interaction.type === InteractionType.ApplicationCommand) {
      await handleSlashCommand(client, interaction);
    }

    // Check if interaction is a modal submission and call handleModalSubmission() if so.
    if (interaction.type === InteractionType.ModalSubmit) {
      await handleModalSubmission(interaction);
    }

    if (interaction.isAutocomplete()) {
      console.log('Autocomplete interaction received');
      await ThreadInfo.autocomplete?.(interaction as AutocompleteInteraction);
    }
  });
};
