/**
 * Slash command that replies with the information of the serever and the user who triggered the command.
 *
 * To trigger, type `/info` on the discord server.
 */

import { CommandInteraction, Client } from "discord.js";
import { SlashCommand } from "../Command";

export const Info: SlashCommand = {
  name: "info",
  description: "Displays info about yourself and the server.",
  run: async (_client: Client, interaction: CommandInteraction) => {
    const content =
      `Your username: ${interaction.user.username}\nYour ID: ${interaction.user.id}` +
      `\n` +
      `Server name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}`;

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};
