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

### `/voice` - Otter.ai style: join voice channel for transcription & recording (ingests to Conduit)

**Actions** (required):

- `join` [channel] : Bot joins (defaults to CHECKINS or VIRTUAL_OFFICE env), starts listening for speakers. **Restricted** — see the consent & recording policy below.
- `stop` : Leaves VC, produces transcript stub + metadata, saves locally to exports/voice/, ingests to conduit.source_documents (via Supabase if configured).
- `status` : Shows the active session (channel, duration, segment/file counts) for the guild.
- `leave` : Force-disconnects the bot and clears the session without ingesting.
- `optout` : Opt yourself out of voice capture and transcription (persisted across sessions and restarts). Replies ephemerally.
- `optin` : Opt yourself back in. Replies ephemerally.

**Consent & recording policy**:

- **Who can start a session**: `/voice join` requires the role configured in the `VOICE_RECORDER_ROLE_ID` environment variable. If that variable is unset, it falls back to requiring the **Administrator** permission. Anyone else gets a clear refusal.
- **Notification**: When a session starts, the bot posts the usual announcement in the transcript channel **and** sends a notice to everyone currently in the voice channel ("this call is being transcribed by GitFitBot; run `/voice optout` to be excluded"). The notice goes to the voice channel's built-in text chat when possible, with a DM fallback per member. Users who join mid-session receive the same notice once (via the `voiceStateUpdate` listener).
- **Opt-out**: `/voice optout` is per-user and persisted (local PouchDB). The bot **never subscribes to an opted-out user's audio stream** — no audio file is created and nothing of theirs is transcribed. They still appear in the final transcript's participants list as `username (not transcribed)`. `/voice optin` reverses it. Both take effect immediately, including during an active session.

**Status**: Initial implementation (speaking events captured; full live audio->STT via whisper-live-server or OpenAI pending for real text). Context (channel, participants, times) captured for conduit ingestion.
