/**
 * Slash command that replies with the information of the user who triggered the command.
 *
 * To trigger, type `/user-info` on the discord server.
 */

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user-info")
    .setDescription("Display info about yourself."),
  async execute(interaction) {
    return interaction.reply(
      `Your username: ${interaction.user.username}\nYour ID: ${interaction.user.id}`
    );
  },
};
