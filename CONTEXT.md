# GitFitBot

GitFitBot is the TypeScript Discord bot for the GitFitCode (GFC) engineering/entrepreneur community, run under pm2. It automates community rituals (retros, standups, events), AI-assisted support tickets backed by Notion, and Claude-powered project digests and weekly pulses.

## Language

### The Community

**GFC**:
Short for GitFitCode, the community and Discord server this bot serves. The prefix appears throughout code and command descriptions (GFC backlog, GFC events, GFC standup).

**gitfitbot**:
The canonical name of the bot and repo.
_Avoid_: autobot (legacy name, still used for the Keybase secrets folder and an unused constant)

**Digital Junkyard**:
The development Discord server where the bot runs during local development (`pnpm dev`). Distinct from the production GitFitCode server.

**First Responders**:
The Discord role (via `FIRST_RESPONDERS_ROLE_ID`) notified when a support ticket is opened.

### Support & Knowledge

**Support Ticket**:
A Discord thread created by `/support create`, paired 1:1 with a Notion page in the Support Tickets database. Closed via `/support close`, which archives the thread and flips the Notion status to Done.

**#question identifier**:
The message prefix (`OPEN_AI_QUESTION_IDENTIFIER`) that, inside a support thread, routes the text to Claude and writes the Q&A back to both the thread and the linked Notion page.

**Notion page ID delimiter**:
The `NOTION_PAGE_ID=<uuid>` suffix embedded in a support thread's starter message, which is how the bot recovers the linked Notion page from a thread later.

**Backlog Task**:
An item created in the GFC Notion backlog via `/backlog`, with a category, task type (bug/feature-request/documentation/none), and priority (high/medium/low). New tasks default to Notion status "To Do".

### Projects & Digests

**Project Thread**:
A post in the gfc-projects forum channel (`GFC_PROJECTS_FORUM_ID`); each forum post/thread represents one community project. The unit that digests and pulses operate on.

**Project Digest**:
A Claude-generated structured summary of a project thread's full transcript (What it is, Stack, Timeline & revenue, Reusable playbook, Open threads), produced by `/project-digest`. Rendered as a Discord embed plus a `.md` attachment, and upserted to the `discord_post_digests` Postgres table.

**Correction**:
An authoritative digest amendment submitted via the digest's ✏️ button by the post author or an admin only. Stored in `digest_feedback` with kind `correction` and folded into every regeneration, overriding the transcript.

**Feedback**:
Advisory digest input anyone can submit via the 💬 button; stored with kind `feedback` but not treated as authoritative.
_Avoid_: conflating with Correction — the permission and regeneration semantics differ

**Linked Project**:
An optional association (`linked_project_id`) from a digest row to a real conduit project. A digest row itself is NOT a conduit/chip `projects` row.

**Transcript / Channel Dump**:
The condensed oldest-to-newest text export of a channel or thread's full message history (`channelDump.ts`, `dumpChannel` script, `exports/`). The raw material fed to digest and pulse prompts — treated as data, never instructions.

**Project Pulse**:
The Monday cron job that posts a 1-2 sentence Claude-written status blurb per active project thread, looking back `PROJECT_PULSE_LOOKBACK_DAYS` (default 30) for activity.
_Avoid_: confusing with Project Digest — pulse is a short weekly blurb, digest is a full case study

### Rituals

**Retro**:
The weekly GFC retrospective meeting, run in the Check-Ins voice channel. `/next-speaker` randomly picks the next attendee who hasn't spoken; when all are done the bot posts the retro-finished message.

**Attendee**:
A PouchDB record (`attendees_db`) of a Check-Ins voice-channel member during a retro, keyed by Discord ID with a `retroDone` flag. The database is reset between retros.

**Check-Ins Channel**:
The specific voice channel (`CHECKINS_VOICE_CHANNEL_ID`) whose current members define the retro attendee pool.

**Standup**:
A `/standup` modal capturing yesterday / today / blockers, posted back to the channel.

**Steering Reminder**:
The Tuesday cron job that pings the founder in a fixed thread for the weekly steering update.

**GFC Event**:
A scheduled Discord event created via `/events` — either a preset type (retro, codewars) or a fully custom one with name, voice channel, and time options.

### Model & Persistence

**Active Model**:
The Claude model tier used for chat-style calls, defaulting to Haiku and switchable at runtime by admins via `/model` (Haiku/Sonnet/Opus). Persisted in `settings_db` under `active_model` so it survives restarts; digests always use the stronger digest model (default Sonnet).

**settings_db**:
The on-disk PouchDB (LevelDB) key/value store for persisted bot settings, currently the active model choice. Sibling of `attendees_db`.

**openAI naming (legacy)**:
Functions and constants named `...OpenAI...` (e.g. `getChatOpenAIPromptResponse`) are legacy names — the implementation calls Anthropic Claude via `@anthropic-ai/sdk`.
_Avoid_: OpenAI, GPT-x, chatGPT when describing the current LLM backend — say Claude
