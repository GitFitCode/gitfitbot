/* eslint-disable object-curly-newline */

/**
 * "interactionCreate" event listener for the bot.
 */

import { CommandInteraction, Client, Interaction, InteractionType } from 'discord.js';
import Commands from '../Commands';

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
  await interaction.deferReply();

  slashCommand.run(client, interaction);
};

export default (client: Client): void => {
  client.on('interactionCreate', async (interaction: Interaction) => {
    // Check if interaction is a command and call handleSlashCommand() if so.
    if (interaction.type === InteractionType.ApplicationCommand) {
      await handleSlashCommand(client, interaction);
    }
  });
};
