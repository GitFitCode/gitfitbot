import { Client, CommandInteraction } from 'discord.js';
import { SlashCommand } from '../Command';

const dontDeferCommands = new Set(['standup', 'project']);

export async function handleSlashCommand(
  client: Client,
  interaction: CommandInteraction,
  commands: readonly SlashCommand[],
): Promise<void> {
  const slashCommand = commands.find((command) => command.name === interaction.commandName);
  if (!slashCommand) {
    await interaction.reply({ ephemeral: true, content: 'An error has occurred.' });
    return;
  }
  try {
    if (!dontDeferCommands.has(interaction.commandName)) await interaction.deferReply();
    await slashCommand.run(client, interaction);
  } catch (error) {
    console.error('Slash command failed', error);
    if (interaction.deferred || interaction.replied) {
      if (interaction.deferred) await interaction.editReply('An error has occurred.');
      return;
    }
    await interaction.reply({ ephemeral: true, content: 'An error has occurred.' });
  }
}
