A discord bot created following guidance from https://discordjs.guide/.

# Setting up the project

## What you'll need
- [VSCode](https://code.visualstudio.com/)
- [VSCode extention `ESLint`](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Nodejs v17](https://nodejs.org/en/)
- [PnPM](https://pnpm.io/) OR [npm](https://www.npmjs.com/)
- [Ensure that your bot was invited to the target server with `bot` and `applications.command` scopes enabled](https://discordjs.guide/preparations/adding-your-bot-to-servers.html).

## Installing Dependencies
- Run `pnpm i` OR `npm i` in the terminal.

## Setting up .env
- Create a file called `.env`.
- Structure it so:
```
CLIENT_ID=
GUILD_ID=
TOKEN=
```
- Populate fields in config.json:
	- `CLIENT_ID` - ID of the bot's OAuth2 client.
	- `GUILD_ID` - ID of the server where the bot is installed/to be installed.
	- `TOKEN` - Token provided by Discord when creating a bot.

## Deploy slash commands and run the bot
- `pnpm deploy-commands`
- `pnpm start`

# Developing new slash commands
- Create a new `.js` file in `commands` folder.
- Name it same as the slash command you'd like to use.
- Follow the format below to create a new slash command:
```javascript
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName(<command name same as file name>)
		.setDescription(<command description>),
	async execute(interaction) {
		//TODO command fired! do something!
	},
};
```
- `pnpm deploy-commands`
- `pnpm start`

Your newly added commands are now ready to be used on discord!
