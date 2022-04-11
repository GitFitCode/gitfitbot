A discord bot created following the guidance from https://discordjs.guide/.

# Setting up the project

## What you'll need
- [VSCode](https://code.visualstudio.com/)
- [VSCode extention `ESLint`](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Nodejs v17](https://nodejs.org/en/)
- [PnPM](https://pnpm.io/) (preferred) OR [npm](https://www.npmjs.com/)
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
BOT_COMMANDS_CHANNEL_ID=
NOTION_TOKEN=
GFC_RETROS_BY_MONTH_NOTION_DB_ID=
```
- Populate fields in the .env file:
  - `CLIENT_ID` - (Required) ID of the bot's OAuth2 client.
  - `GUILD_ID` - (Required) ID of the server where the bot is installed/to be installed.
  - `TOKEN` - (Required) Token provided by Discord when creating a bot.
  - `BOT_COMMANDS_CHANNEL_ID` - (Optional) An isolated Discord Channel within GFC for all your #monkeytesting.
  - `NOTION_TOKEN` - (Optional) Token provided by Notion when creating a Notion integration.
  - `GFC_RETROS_BY_MONTH_NOTION_DB_ID` - (Optional) ID of [GFC's Retrospectives By Month Notion Database](https://www.notion.so/gitfitcode/a3a30be6c6564f6194e90aa858a75f49?v=3337964233d247ecbaa3c4f6f9b9a7ec).

## Deploy slash commands and run the bot
- `pnpm deploy-commands` OR `npm run deploy-commands`
- `pnpm start` OR `npm run start`

# Developing new slash commands
- Create a new `.js` file in `slash-commands` folder.
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
- `pnpm deploy-commands` OR `npm run deply-commands`
- `pnpm start` OR `npm run start`

Your newly added slash commands are now ready to be used on discord!

# Developing new raw commands

- Create a new `.js` file in the `raw-commands` folder.
- Name it same as the raw command you'd like to use.
- Follow the format below to create a new raw command:
```javascript
module.exports = async (message) => {
	await message.reply(`Hey〈〈${message.author} 〉〉! I hope you're having a wonderful day!`);
};
```
- `pnpm start` OR `npm run start`

Your newly added raw commands are now ready to be used on discord!
