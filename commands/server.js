/**
 * Slash command that replies with the discord server information when triggered.
 *
 * To trigger, type `/server` on the discord server.
 */

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Display info about this server."),
  async execute(interaction) {
    return interaction.reply(
      `Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`
    );
  },
};
