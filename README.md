# gitfitbot <!-- omit from toc -->

Table of Contents:

- [Setting up the project](#setting-up-the-project)
  - [What you'll need](#what-youll-need)
  - [Installing dependencies](#installing-dependencies)
  - [Setting up .env](#setting-up-env)
  - [Run the bot](#run-the-bot)
- [Development](#development)
  - [Commit message](#commit-message)
  - [Currently supported commands](#currently-supported-commands)
  - [Create new slash commands](#create-new-slash-commands)
  - [Create new discord event listeners](#create-new-discord-event-listeners)
- [\[OPTIONAL\] Local Docker Setup](#optional-local-docker-setup)

## Setting up the project

### What you'll need

- [VSCode](https://code.visualstudio.com/) / [Intellij WebStorm](https://www.jetbrains.com/webstorm/)
- [Nodejs LTS](https://nodejs.org/en/) (Please check package.json for the latest supported Node version)
- [PnPM](https://pnpm.io) package manager

**Note**: You **_DO NOT_** need docker to run the bot locally.

### Installing dependencies

```sh
pnpm i
```

### Setting up .env

- Create a file called `.env` at the root of your project.

  <details>
  <summary>Here are the required environment variables</summary>

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

  - `OPENAI_API_KEY` - (Optional) - API Key for accessing OpenAI functionality.

  </details>

- Populate fields in the `.env` file.

  - Sign up on [Keybase](https://keybase.io/)!
  - Ask Sirrele, Pratik, or Robert for an invite to the GitFitCode Team in Keybase.
  - Upon receiving the invite, navigate to the Files section in Keybase.
  - Inside Files, look for team -> gitfitcode -> discord bot secrets -> autobot -> `.env`.
  - Download or copy contents into your local `.env` file.

- Get access to the [Digital Junkyard](https://discord.gg/4cJFTdGMBY) development server on Discord.

### Run the bot

```shell
pnpm dev
```

## Development

### Commit message

When committing code to the repo, please follow the commit message guidelines/patterns set [here](https://github.com/conventional-changelog/commitlint#what-is-commitlint) and [here](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#type).

### Currently supported commands

[Supported Commands](/docs/COMMANDS)

### Create new slash commands

- Add command constants in `src/utils/constants.ts` file.
  ```typescript
  // Info command constants
  export const COMMAND_INFO = {
    COMMAND_NAME: 'info',
    COMMAND_DESCRIPTION: 'Displays info about yourself and the server.',
  };
  ```
- Create a new `.ts` file in `src/commands` directory.
- Name it same as the slash command (e.g. `Info.ts`).
- Follow the example format below to create a new slash command:

  ```typescript
  /**
   * Slash command that replies with the information of the server and the user who
   * triggered the command.
   *
   * To trigger, type `/info` in the discord server.
   */

  import * as Sentry from '@sentry/node';
  import { CommandInteraction, Client } from 'discord.js';
  import { version } from '../../package.json';
  import { COMMAND_INFO } from '../utils';
  import { SlashCommand } from '../Command';

  require('@sentry/tracing');

  async function executeRun(interaction: CommandInteraction) {
    Sentry.setUser({
      id: interaction.user.id,
      username: interaction.user.username,
    });
    const transaction = Sentry.startTransaction({
      op: 'transaction',
      name: `/${COMMAND_INFO.COMMAND_NAME}`,
    });

    const content = `\`Your username\`: ${interaction.user.username}
  \`Your ID\`: ${interaction.user.id}
  \`Server name\`: ${interaction.guild?.name}
  \`Total members\`: ${interaction.guild?.memberCount}
  \`${interaction.client.user.username} version\`: ${version}`;

    await interaction.followUp({ ephemeral: true, content });

    transaction.finish();
    Sentry.setUser(null);
  }

  const Info: SlashCommand = {
    name: COMMAND_INFO.COMMAND_NAME,
    description: COMMAND_INFO.COMMAND_DESCRIPTION,
    run: async (_client: Client, interaction: CommandInteraction) => {
      await executeRun(interaction);
    },
  };

  export default Info;
  ```

- Update the code for the required logic.

- Import the command in `src/Commands.ts` file to register the command on discord.

  ```typescript
  import Info from './commands/Info';

  const Commands: SlashCommand[] = [
    //...
    Info,
    //...
  ];
  ```

- Run the bot:

  ```shell
  pnpm dev
  ```

Your newly added slash commands are now ready to be used on discord!

### Create new discord event listeners

- Create a new `.ts` file in `src/listeners` directory.
- Name it according to the event you want to listen to from [here](https://discord.js.org/docs/packages/discord.js/main/Client:Class) (e.g. `ready.ts`).
- Follow the example below to create a new event listener:

  ```typescript
  import { ActivityType, Client } from 'discord.js';
  import Commands from '../Commands';

  export default (client: Client): void => {
    client.on('ready', async () => {
      if (!client.user || !client.application) {
        return;
      }

      console.log(`${client.user.username} is online`);
    });
  };
  ```

- Register the listener in `src/Bot.ts` file:

  ```typescript
  function start () {
  ...
    ready(client);
  ...
  }
  ```

- Run the bot:
  ```shell
  pnpm dev
  ```

**Note**: If you're having issues listening to events, ensure the intents are accurately provided in `src/Bot.ts` file.

## [OPTIONAL] Local Docker Setup

- Ensure you've followed every step in [Setting up the project](#setting-up-the-project) step.
- Install Docker
  - [Docker Engine](https://docs.docker.com/engine/install/) (if you're on a \*nix system)
  - [Docker Desktop](https://docs.docker.com/desktop/) (Windows/macOS)
- Build image:
  ```shell
  docker build --tag gitfitbot .
  ```
- Run the bot:

  ```shell
    docker run --detach --name gitfitbot-container --env-file ./.env gitfitbot
  ```

- Stop/Restart the bot

  - List all docker processes:
    ```shell
    docker ps
    ```
  - Stop the bot's container:
    ```shell
    docker stop <CONTAINER ID>
    ```
  - Restart the bot's container:
    ```shell
    docker restart <CONTAINER ID>
    ```
