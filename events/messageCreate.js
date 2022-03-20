module.exports = {
	name: 'messageCreate',
	once: false,
	execute(message) {
		console.log(`Message created - ${message}`);
	},
};