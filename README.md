## Setting up the project

### What you'll need

- [VSCode](https://code.visualstudio.com/)/[Intellij WebStorm](https://www.jetbrains.com/webstorm/)
- [Nodejs LTS](https://nodejs.org/en/) (Please check package.json for the latest supported Node version)
- [NPM](https://www.npmjs.com/)

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

- Create a file called `.env` at the root of your project.

- Here are the required environment variables:

  - `DISCORD_BOT_TOKEN` - (Required) Token provided by Discord when creating the bot.
  - `BOT_ID` - (Required) ID of the GFC Discord bot.
  - `GFC_INTRO_SURVEY_LINK` - (Required) - URL of the GFC intro survey link.

  - `ADMIN_1_DISCORD_ID` - (Required) ID of an admin of the GFC discord server.
  - `ADMIN_2_DISCORD_ID` - (Required) - ID of another admin of the GFC discord server.

  - `DISCORD_SERVER_ID` - (Required) - ID of the server where this bot is invited.
  - `ADMIN_ROLE_ID` - (Required) - ID of the admin role in the server.
  - `GENERAL_CHAT_CHANNEL_ID` - (Required) - ID of the general chat channel in the GFC discord server.
  - `CHECKINS_VOICE_CHANNEL_ID` - (Required) - ID of the check-ins voice channel in the GFC discord server.
  - `FIRST_RESPONDERS_ROLE_ID` - (Required) - ID of the role `@First-Responders`.
  - `VIRTUAL_OFFICE_VOICE_CHANNEL_ID` - (Required) - ID of the virtual office voice channel in the GFC discord server.

  - `NOTION_KEY` - (Required) Secret key of the GFC Notion integration.
  - `NOTION_SUPPORT_TICKETS_DATABASE_ID` - (Required) ID of the GFC Notion database which will store all support tickets.
  - `NOTION_SUPPORT_TICKETS_DATABASE_STATUS_ID` - (Required) - ID of the status property in the notion support tickets database.
  - `NOTION_SUPPORT_TICKETS_DATABASE_LINK` - (Required) - URL of the notion support tickets database.
  - `NOTION_RETRO_DATABASE_ID` - (Required) - ID of the retrospective notion database.
  - `NOTION_BACKLOG_DATABASE_ID` - (Required) - ID of the backlog notion database.
  - `NOTION_BACKLOG_DATABASE_LINK` - (Required) - URL of the notion backlog database.

  - `SENTRY_DSN` - (Optional) - DSN of your nodejs project on [sentry.io](https://sentry.io/).

- Populate fields in the `.env` file.

  - Sign up on [Keybase](https://keybase.io/)!
  - Ask Sirrele, Pratik, or Robert for an invite to the GitFitCode Team in Keybase.
  - Upon receiving the invite, navigate to the Files section in Keybase.
  - Inside Files, look for team -> gitfitcode -> discord bot secrets -> autobot -> `.env`.
  - Download or copy contents into your local `.env` file.
  - Now your local development environment is set up!

- Get access to the `Digital Junkyard` development server on Discord from Sirrele, Pratik, Robert, Felix or Von.


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

- Import the command in `src/Commands.ts` file.
- Run the bot.

  ```shell
  npm run dev
  ```

Your newly added slash commands are now ready to be used on discord!

### Commit message

When committing code to the repo, please follow the commit message guidelines/patterns set [here](https://github.com/conventional-changelog/commitlint#what-is-commitlint) and [here](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#type).
