## Setting up the project

### What you'll need

- [VSCode](https://code.visualstudio.com/)/[Intellij WebStorm](https://www.jetbrains.com/webstorm/)
- [Nodejs v16 LTS](https://nodejs.org/en/)
- [PnPM](https://pnpm.io/) (use the standalone script)
- [Ensure that your bot was invited to the target server with `bot` and `applications.command` scopes enabled](https://discordjs.guide/preparations/adding-your-bot-to-servers.html).

### Installing Dependencies

```sh
pnpm i
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
CLIENT_ID=
GUILD_ID=
DISCORD_TOKEN=
```

- Populate fields in the .env file:
  - `CLIENT_ID` - (Required) ID of the bot's OAuth2 client.
  - `GUILD_ID` - (Required) ID of the server where the bot is installed/to be installed.
  - `DISCORD_TOKEN` - (Required) Token provided by Discord when creating the bot.

### Run the bot

```shell
pnpm start
```

## Development

### Slash commands

- Create a new `.ts` file in `src/commands` folder.
- Name it same as the slash command you'd like to use (e.g. `Ping.ts`).
- Follow the example format below to create a new slash command:

```typescript
import { CommandInteraction, Client } from "discord.js";
import { Command } from "../Command";

export const Ping: Command = {
  name: "ping",
  description: "Returns Pong!",
  run: async (_client: Client, interaction: CommandInteraction) => {
    const content = "Pong!";

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};
```

```shell
pnpm start
```

Your newly added slash commands are now ready to be used on discord!

### Commit message

When committing code to the repo, please follow the commit message guidelines/patterns set [here](https://github.com/conventional-changelog/commitlint#what-is-commitlint).
