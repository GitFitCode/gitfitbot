/**
 * Slash (i.e. custom) command that replies with the information of the user who triggered the command.
 *
 * To trigger, type `/user-info` on the discord server.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Replies with user info!'),
	async execute(interaction) {
		return interaction.reply(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`);
	},
};
