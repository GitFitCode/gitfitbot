## Setting up the project

### What you'll need

- [VSCode](https://code.visualstudio.com/)/[Intellij WebStorm](https://www.jetbrains.com/webstorm/)
- [Nodejs v16 LTS](https://nodejs.org/en/)
- [NPM](https://www.npmjs.com/)
- [Ensure that your bot was invited to the target server with `bot` and `applications.command` scopes enabled](https://discordjs.guide/preparations/adding-your-bot-to-servers.html).

### Installing Dependencies

```sh
npm i
```

#### Setting up husky pre-commit hooks

```sh
npx husky install
npx husky add .husky/commit-msg 'npx commitlint --edit'
```

### Setting up .env

- Create a file called `.env`.
- Structure it so:

```js
DISCORD_BOT_TOKEN=
BOT_ID=
GFC_INTRO_SURVEY_LINK=

ADMIN_1_DISCORD_ID=
ADMIN_2_DISCORD_ID=

GENERAL_CHAT_CHANNEL_ID=
CHECKINS_VOICE_CHANNEL_ID=

NOTION_KEY=
NOTION_DATABASE_ID=
```

- Populate fields in the .env file:
  - `DISCORD_BOT_TOKEN` - (Required) Token provided by Discord when creating the bot.
  - `BOT_ID` - (Required) ID of the GFC Discord bot.
  - `GFC_INTRO_SURVEY_LINK` - (Required) - URL of the GFC intro survey link.
  - `ADMIN_1_DISCORD_ID` - (Required) ID of an admin of the GFC discord server.
  - `ADMIN_2_DISCORD_ID` - (Required) - ID of another admin of the GFC discord server.
  - `GENERAL_CHAT_CHANNEL_ID` - (Required) - ID of the general chat channel in the GFC discord server.
  - `CHECKINS_VOICE_CHANNEL_ID` - (Required) - ID of the check-ins voice channel in the GFC discord server.
  - `NOTION_KEY` - (Required) Secret key of the GFC Notion integration.
  - `NOTION_DATABASE_ID` - (Required) ID of the GFC Notion database which will store all support tickets.

### Run the bot

```shell
npm run dev
```

## Development

### Slash commands

- Create a new `.ts` file in `src/commands` folder.
- Name it same as the slash command (e.g. `Info.ts`).
- Follow the example format below to create a new slash command:

```typescript
import { CommandInteraction, Client } from 'discord.js';
import { SlashCommand } from '../Command';

const Info: SlashCommand = {
  name: 'info',
  description: 'Displays info about yourself and the server.',
  run: async (_client: Client, interaction: CommandInteraction) => {
    const content = `Your username: ${interaction.user.username}
Your ID: ${interaction.user.id}
Server name: ${interaction.guild?.name}
Total members: ${interaction.guild?.memberCount}`;

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};

export default Info;
```

```shell
npm run dev
```

Your newly added slash commands are now ready to be used on discord!

### Commit message

When committing code to the repo, please follow the commit message guidelines/patterns set [here](https://github.com/conventional-changelog/commitlint#what-is-commitlint) and [here](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#type).
