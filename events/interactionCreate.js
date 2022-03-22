/**
 * Listen to `interactionCreate` event from discord.
 */

/**
 * https://discord.js.org/#/docs/main/stable/class/Interaction
 *
 * Function to parse the interaction created on the discord server.
 * @param {Interaction} interaction
 */
async function parseInteraction(interaction) {
	if (!interaction.isCommand()) return;

	console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) return;

	try {
		await command.execute(interaction);
	}
	catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
}

module.exports = {
	name: 'interactionCreate',
	async execute(interaction) {
		parseInteraction(interaction);
	},
};
