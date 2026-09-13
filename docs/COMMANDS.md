## List of commands, subcommands and options supported by the bot. <!-- omit from toc -->

- [`/dadjokes` - Jokes from icanhazdadjoke.com/](#dadjokes---jokes-from-icanhazdadjokecom)
- [`/events` - Create community and custom events quickly](#events---create-community-and-custom-events-quickly)
- [`/backlog` - Tasks to be created in GFC backlog](#backlog---tasks-to-be-created-in-gfc-backlog)
- [`/info` - Information about you, server and the bot](#info---information-about-you-server-and-the-bot)
- [`/joke` - Jokes from jokeapi.dev](#joke---jokes-from-jokeapidev)
- [`/next-speaker` - Choose the next speaker randomly for a meeting (usually, a GFC retrospective)](#next-speaker---choose-the-next-speaker-randomly-for-a-meeting-usually-a-gfc-retrospective)
- [`/ping` - A quick test to see if the bot is online](#ping---a-quick-test-to-see-if-the-bot-is-online)
- [`/support` - Open a support ticket and converse with GPT-x](#support---open-a-support-ticket-and-converse-with-gpt-x)
- [`/test` - A test command where the bot will respond with `Test.`](#test---a-test-command-where-the-bot-will-respond-with-test)
- [`/tictactoe` - Tic Tac Toe game that can be playes with AI or a human opponent](#tictactoe---tic-tac-toe-game-that-can-be-playes-with-ai-or-a-human-opponent)
- [`/standup` - Provide standup update](#standup---provide-standup-update)
- [`/project init` - Start browser onboarding](#project-init---start-browser-onboarding)

---

### `/dadjokes` - Jokes from [icanhazdadjoke.com/](https://icanhazdadjoke.com/)

### `/events` - Create community and custom events quickly

**Subcommands**:

1. Custom
2. List
3. Retro
4. Codewars
5. Clear

**Custom - Options**:

1.  Name
2.  Description
3.  Voice Channel
4.  Year
5.  Month
6.  Day
7.  Hour
8.  Minute
9.  AM/PM
10. Timezone

**Retro - Options**:

1.  Year
2.  Month
3.  Day
4.  Hour
5.  Minute
6.  AM/PM
7.  Timezone

**Codewars - Options**:

1.  Year
2.  Month
3.  Day
4.  Hour
5.  Minute
6.  AM/PM
7.  Timezone

### `/backlog` - Tasks to be created in GFC backlog

**Options**:

1. Category
   1. General
   2. Discord Server
   3. Discord Bot
   4. Notion
   5. GitHub
   6. Other
2. Title
3. Description
4. Task Type
   1. Bug
   2. Feature Request
   3. Documentation
   4. None
5. Priority
   1. High 🔥
   2. Medium
   3. Low

### `/info` - Information about you, server and the bot

### `/joke` - Jokes from [jokeapi.dev](https://jokeapi.dev/)

**Options**:

1. Category - **OPTIONAL**
   1. Programming
   2. Miscellaneous
   3. Dark
   4. Pun
   5. Spooky
   6. Christmas

### `/next-speaker` - Choose the next speaker randomly for a meeting (usually, a GFC retrospective)

### `/ping` - A quick test to see if the bot is online

### `/support` - Open a support ticket and converse with GPT-x

**Subcommands**:

1. Create
2. Close

**Create - Options**:

1. Issue

### `/test` - A test command where the bot will respond with `Test.`

### `/tictactoe` - Tic Tac Toe game that can be playes with AI or a human opponent

**Options**:

1. Opponent - **OPTIONAL**

### `/standup` - Provide standup update

### `/project init` - Start browser onboarding

Run this in a GitFitCode server to receive an ephemeral **Continue in hub** link. The browser hub requires sign-in and is where project setup is reviewed and saved; the command does not create a project or connect GitHub.

Set `GFC_PROJECT_HUB_ORIGIN` to the HTTPS hub origin (HTTP is accepted only for loopback development). Build before configuring a client:

```sh
pnpm build
```

Use a protocol-clean launch command: ordinary `pnpm mcp:project-init` writes pnpm's package banner to stdout, which corrupts stdio MCP. For example, a client configuration can use:

```json
{
  "mcpServers": {
    "gitfitbot-project-init": {
      "command": "pnpm",
      "args": ["--silent", "mcp:project-init"],
      "cwd": "/path/to/gitfitbot",
      "env": {
        "GFC_PROJECT_HUB_ORIGIN": "https://hub.gitfitcode.org"
      }
    }
  }
}
```

Call `project_init` with `{}` to get the same URL as Discord and the `requires_browser_sign_in` state. The returned URL starts browser onboarding only; sign in, review, and save there to complete it. Later work may add reviewed direct MCP identity delegation and owner-reviewed voice drafts; neither is part of this handoff. If a future owner-approved publish step is added, it must create or link one post in the [gfc-projects forum](https://discord.com/channels/328054349420822530/1032761290919260262) and send updates to that post's thread, rather than treating a separate text channel or website-only record as the project destination.

#### Project Hub forum delivery worker (not a command)

GitFitBot can pull owner-approved Project Hub deliveries and create, reconcile, or connect exactly one post in the gfc-projects forum. The worker is outbound-only and **off by default**; it starts only when `GFC_PROJECT_DELIVERY_ENABLED=true`, `GFC_PROJECT_HUB_ORIGIN` passes the same origin rules as `/project init`, and `GFC_HUB_DELIVERY_TOKEN` holds the Hub-issued service token. Optional `GFC_PROJECTS_TAG_IDS` lists up to five forum tag IDs. The guild and forum are pinned in code, created posts never ping anyone or show embeds, and the bot keeps no delivery state of its own — the Hub owns it. Enabling the worker, issuing a token, and the first live post are separate human-approved steps.

### `/voice` - Otter.ai style: join voice channel for transcription & recording (ingests to Conduit)

**Actions** (required):

- `join` [channel] : Bot joins (defaults to CHECKINS or VIRTUAL_OFFICE env), starts listening for speakers. **Restricted** — see the consent & recording policy below.
- `stop` : Leaves VC, batch-transcribes the full session recording, produces the final transcript + metadata, **generates a digest** (TL;DR, key discussion points, decisions, action items with owners) via the same Sonnet pipeline as `/project-digest` and posts it to the session thread as an embed with the full transcript attached as a `.md` file, saves locally to exports/voice/, and ingests to conduit via its **intake HTTP endpoint** (POST to `CONDUIT_INGEST_URL` with bearer `CONDUIT_INGEST_TOKEN`; served by `conduit web serve`) with a `## Digest` section prepended to the document body. Ingest retries once on network/5xx failure; the summary message reports the returned doc ID on success (noting idempotent resubmits) or the failure reason + local export path. When `CONDUIT_INGEST_URL` is unset, ingest is skipped and only the local export happens. Empty/trivial transcripts get a brief "nothing substantive to digest" note instead (no LLM call); a digest API failure is noted but never blocks the export/ingest.
- `status` : Shows the active session (channel, duration, segment/file counts) for the guild.
- `leave` : Force-disconnects the bot and clears the session without ingesting.
- `optout` : Opt yourself out of voice capture and transcription (persisted across sessions and restarts). Replies ephemerally.
- `optin` : Opt yourself back in. Replies ephemerally.

**Consent & recording policy**:

- **Who can start a session**: `/voice join` requires the role configured in the `VOICE_RECORDER_ROLE_ID` environment variable. If that variable is unset, it falls back to requiring the **Administrator** permission. Anyone else gets a clear refusal.
- **Notification**: When a session starts, the bot posts the usual announcement in the transcript channel **and** sends a notice to everyone currently in the voice channel ("this call is being transcribed by GitFitBot; run `/voice optout` to be excluded"). The notice goes to the voice channel's built-in text chat when possible, with a DM fallback per member. Users who join mid-session receive the same notice once (via the `voiceStateUpdate` listener).
- **Opt-out**: `/voice optout` is per-user and persisted (local PouchDB). The bot **never subscribes to an opted-out user's audio stream** — no audio file is created and nothing of theirs is transcribed. They still appear in the final transcript's participants list as `username (not transcribed)`. `/voice optin` reverses it. Both take effect immediately, including during an active session.

**Recording & transcription pipeline**:

- While a session is active, each (non-opted-out) user's audio is recorded **continuously** to rotating 5-minute WAV chunks under `audio/<guildId>-<sessionStartTs>/<userId>/`, with a `manifest.json` in the session dir — a crash loses at most the current chunk.
- Live captions in the thread stay per-utterance (short clips with quality guards), but they are only captions.
- The **final transcript** now comes from a full-quality **batch transcription pass over the chunk recordings at `/voice stop`**: the bot posts a "processing full recording…" message, transcribes each chunk (local Whisper first, OpenAI fallback), merges results across users by chunk start time into `[HH:MM:SS] username: text` lines, and uses that for the export + Conduit ingest. Live captions are kept in the export under "Live captions (raw)" for comparison, and are used as a fallback if the batch pass produces nothing. The batch pass is capped at 15 minutes; on timeout, unprocessed chunk file paths are noted.

**Session lifecycle & audio retention**:

- **Restart survival**: session metadata (guild, channel, thread, start time, audio dir) is persisted to a local PouchDB (`voice_sessions_db`) when a session starts and cleared on `/voice stop` and `/voice leave`. If the bot restarts mid-session, on boot it disconnects any lingering voice connection, posts "⚠️ Transcription session was interrupted by a bot restart…" to the session thread (fallback: the transcript/general channel) with the preserved audio dir path, and clears the record. Recovery is salvage + cleanup only — no automatic re-transcription; the chunk WAVs and `manifest.json` stay on disk for manual recovery.
- **Retention** (`VOICE_AUDIO_RETENTION`, default `keep-days:7`): with `keep-days:N`, a startup sweep deletes `audio/*` session dirs older than N days (never a just-recovered session's dir). With `delete`, a session's audio dir is removed immediately after a clean `/voice stop`, but only when the local export succeeded **and** Conduit ingest succeeded (or is unconfigured) — a failed ingest always keeps the audio, and crash-salvage dirs are never swept in `delete` mode.
