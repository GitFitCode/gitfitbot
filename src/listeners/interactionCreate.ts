/* eslint-disable object-curly-newline */

/**
 * "interactionCreate" event listener for the bot.
 */

import newrelic from 'newrelic';
import {
  CommandInteraction,
  Client,
  Interaction,
  InteractionType,
  CacheType,
  ModalSubmitInteraction,
} from 'discord.js';
import Commands from '../Commands';
import { COMMAND_STANDUP } from '../utils';

// All commands that invoke a modal should be listed here.
const dontDeferCommandsList = [COMMAND_STANDUP.COMMAND_NAME];

/**
 * Handles slash command interactions.
 *
 * This function is triggered when a slash command is used in Discord. It starts a web transaction
 * to monitor the performance and errors using New Relic. It logs custom attributes such as the
 * Discord username, user ID, and the application version. If the command is found, it defers the reply
 * to keep the interaction token valid for long-running tasks and then runs the command. If any error
 * occurs during the execution, it captures and logs the error using New Relic and rethrows the error.
 *
 * @param {Client} client - The Discord client.
 * @param {CommandInteraction} interaction - The interaction object representing the slash command.
 */
const handleSlashCommand = async (
  client: Client,
  interaction: CommandInteraction,
): Promise<void> => {
  newrelic.startWebTransaction(`/${interaction.commandName}`, async () => {
    try {
      // Add the Discord username as a custom attribute to the transaction.
      newrelic.addCustomAttribute('discordUsername', interaction.user.username);
      // Add the Discord user id as a custom attribute to the transaction.
      newrelic.addCustomAttribute('discordUserId', interaction.user.id);
      // Add app version as a custom attribute to the transaction.
      const appVersion: string = require('../../package.json').version;
      newrelic.addCustomAttribute('appVersion', appVersion);

      const slashCommand = Commands.find((c) => c.name === interaction.commandName);
      if (!slashCommand) {
        interaction.followUp({ content: 'An error has occurred' });
        newrelic.endTransaction();
        return;
      }

      // Ensure interaction token remains valid for long running tasks.
      // https://discordjs.guide/slash-commands/response-methods.html#deferred-responses
      if (!dontDeferCommandsList.includes(interaction.commandName)) {
        await interaction.deferReply();
      }

      slashCommand.run(client, interaction);

      // End the transaction when your command execution is done.
      newrelic.endTransaction();
    } catch (error) {
      // Make sure to end the transaction even if an error occurs.
      newrelic.endTransaction();

      // Check if error is an instance of Error.
      if (error instanceof Error) {
        // Capture the error in New Relic.
        newrelic.noticeError(error);

        // Log the error to the console.
        console.error(error);
      } else {
        // If error is not an instance of Error, create a new Error object and capture that.
        const newError = new Error(String(error));
        newrelic.noticeError(newError);

        // Log the new error to the console.
        console.error(newError);
      }

      throw error;
    }
  });
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
  });
};
