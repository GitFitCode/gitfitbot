/**
 * Slash command that replies with the information of the user who triggered the command.
 *
 * To trigger, type `/user-info` on the discord server.
 */

import { CommandInteraction, Client } from "discord.js";
import { SlashCommand } from "../Command";

export const UserInfo: SlashCommand = {
  name: "user-info",
  description: "Display info about yourself.",
  run: async (_client: Client, interaction: CommandInteraction) => {
    const content = `Your username: ${interaction.user.username}\nYour ID: ${interaction.user.id}`;

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};
