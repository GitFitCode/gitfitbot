/* eslint-disable object-curly-newline */

/**
 * "interactionCreate" event listener for the bot.
 */

import newrelic from 'newrelic';
import { CommandInteraction, Client, Interaction, InteractionType } from 'discord.js';
import Commands from '../Commands';

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
      await interaction.deferReply();

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

export default (client: Client): void => {
  client.on('interactionCreate', async (interaction: Interaction) => {
    // Check if interaction is a command and call handleSlashCommand() if so.
    if (interaction.type === InteractionType.ApplicationCommand) {
      await handleSlashCommand(client, interaction);
    }
  });
};
