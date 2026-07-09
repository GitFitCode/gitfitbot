/**
 * Slash command for Otter.ai-like experience in Discord.
 * Bot joins a voice channel, transcribes (using OpenAI Whisper or prepared for whisper-live-server),
 * records audio, and ingests full context + transcript into conduit.
 */

import {
  entersState,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import {
  ApplicationCommandOptionType,
  ChannelType,
  Client,
  CommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  VoiceBasedChannel,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { request } from 'undici';
import { SlashCommand } from '../Command';
import { COMMAND_VOICE } from '../utils/constants';
import { addVoiceOptOut, fetchAllVoiceOptOuts, removeVoiceOptOut } from '../utils/localdb';
import { ChunkMeta, SessionRecorder } from '../utils/voiceRecorder';

interface VoiceSession {
  connection: VoiceConnection;
  client: Client;
  guildId: string;
  channelId: string;
  channelName: string;
  startedAt: Date;
  speakingEvents: Array<{
    userId: string;
    username: string;
    started: Date;
    ended?: Date;
    optedOut?: boolean;
  }>;
  transcripts: string[];
  audioPaths: string[];
  transcriptThread?: any; // Discord ThreadChannel for the live convo
  startMessage?: any; // The initial "GitFitBot joined..." announcement message.
  allLiveMessage?: any; // The "All live segments..." message. Live captions will reply to this to be "within a reply".
  localTranscriptions: number;
  openaiTranscriptions: number;
  estimatedAudioSeconds: number; // rough, for cost awareness
  pendingTranscriptions: Set<Promise<void>>; // in-flight transcription work, drained on /voice stop
  optOutSet: Set<string>; // user IDs opted out of capture/transcription (cached at start, refreshed on /voice optout|optin)
  notifiedUserIds: Set<string>; // users already sent the recording notice this session
  recorder: SessionRecorder; // continuous per-user chunk recording + utterance segmentation (#79)
}

const activeSessions: Map<string, VoiceSession> = new Map();

/**
 * Returns the voice channel ID of the active transcription session for a guild,
 * or null if there is no active session. Used by the voiceStateUpdate listener
 * to detect mid-session joiners.
 */
export function getActiveSessionChannel(guildId: string): string | null {
  return activeSessions.get(guildId)?.channelId ?? null;
}

/**
 * Sends the "this call is being transcribed" notice to the given members, at
 * most once per member per session. Tries the voice channel's built-in text
 * chat first; falls back to DMing each member individually.
 */
async function sendRecordingNotice(session: VoiceSession, members: GuildMember[]): Promise<void> {
  const targets = members.filter((m) => !m.user.bot && !session.notifiedUserIds.has(m.id));
  if (targets.length === 0) return;
  for (const m of targets) session.notifiedUserIds.add(m.id);

  const mentions = targets.map((m) => `<@${m.id}>`).join(' ');
  const notice =
    `${mentions} 🎙️ Heads up: this call in **${session.channelName}** is being transcribed and recorded by GitFitBot. ` +
    `Run \`/voice optout\` if you don't want your audio captured or transcribed (you'll show as "(not transcribed)"). ` +
    `Run \`/voice optin\` to re-enable.`;

  // Prefer the voice channel's built-in text chat (visible to everyone on the call).
  try {
    const vc: any = await session.client.channels.fetch(session.channelId).catch(() => null);
    if (vc && 'send' in vc) {
      await vc.send(notice);
      console.log(
        `[VOICE] Recording notice posted in VC text chat for ${targets.length} member(s).`,
      );
      return;
    }
  } catch (e: any) {
    console.warn('[VOICE] VC text chat notice failed, falling back to DMs:', e?.message || e);
  }

  // Fallback: DM each member (DMs can be disabled; best effort).
  const dmNotice =
    `🎙️ Heads up: the call in **${session.channelName}** is being transcribed and recorded by GitFitBot. ` +
    `Run \`/voice optout\` in the server if you don't want your audio captured or transcribed. ` +
    `Run \`/voice optin\` to re-enable.`;
  for (const m of targets) {
    await m.send(dmNotice).catch((e: any) => {
      console.warn(`[VOICE] Could not DM recording notice to ${m.user.username}:`, e?.message || e);
    });
  }
}

/**
 * Notifies a user who joined a voice channel with an active transcription
 * session (called from the voiceStateUpdate listener). One notice per user
 * per session.
 */
export async function notifyMidSessionJoiner(guildId: string, member: GuildMember): Promise<void> {
  const session = activeSessions.get(guildId);
  if (!session) return;
  await sendRecordingNotice(session, [member]);
}

/**
 * Called from the voiceStateUpdate listener when a user leaves the voice
 * channel of an active session: closes their continuous recording chunk so
 * the audio written so far is finalized on disk.
 */
export function handleVoiceChannelLeave(guildId: string, userId: string): void {
  const session = activeSessions.get(guildId);
  if (!session) return;
  session.recorder.closeUser(userId, 'left the voice channel');
}

async function getVoiceChannel(
  interaction: CommandInteraction,
  explicit?: string | null,
): Promise<VoiceBasedChannel | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  if (explicit) {
    const ch = await guild.channels.fetch(explicit).catch(() => null);
    if (ch && ch.type === ChannelType.GuildVoice) return ch as VoiceBasedChannel;
  }

  // NEW: If the user who ran the command is currently connected to a voice channel,
  // use that automatically. This is the nicest UX when running the command from
  // a voice channel or while already in one.
  const member = interaction.member as GuildMember | null;
  const currentVoice = member?.voice?.channel;
  if (currentVoice && currentVoice.type === ChannelType.GuildVoice) {
    return currentVoice as VoiceBasedChannel;
  }

  // Default to env configured or first voice
  const checkins = process.env.CHECKINS_VOICE_CHANNEL_ID;
  if (checkins) {
    const ch = await guild.channels.fetch(checkins).catch(() => null);
    if (ch && ch.type === ChannelType.GuildVoice) return ch as VoiceBasedChannel;
  }
  const office = process.env.VIRTUAL_OFFICE_VOICE_CHANNEL_ID;
  if (office) {
    const ch = await guild.channels.fetch(office).catch(() => null);
    if (ch && ch.type === ChannelType.GuildVoice) return ch as VoiceBasedChannel;
  }

  // Fallback: find any voice channel with people
  const any = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && (c as VoiceBasedChannel).members.size > 0,
  ) as VoiceBasedChannel | undefined;
  return any ?? null;
}

async function joinAndListen(
  client: Client,
  interaction: CommandInteraction,
  targetChannelId?: string | null,
) {
  const guild = interaction.guild!;
  const voiceChannel = await getVoiceChannel(interaction, targetChannelId);
  if (!voiceChannel) {
    await interaction.followUp({
      content:
        'No suitable voice channel found or specified. Use /voice join <channel> or set CHECKINS_VOICE_CHANNEL_ID.',
    });
    return;
  }

  const guildId = guild.id;
  if (activeSessions.has(guildId)) {
    await interaction.followUp({
      content: `Already listening in a voice channel for this guild. Use /voice stop first.`,
    });
    return;
  }

  await interaction.followUp({
    content: `Joining **${voiceChannel.name}** and starting transcription session... (Otter mode)`,
    ephemeral: true,
  });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator as any,
    selfDeaf: false,
    selfMute: true, // listen only
  });

  // Better observability for voice connection
  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log(`[VOICE] ✅ Voice connection READY in ${voiceChannel.name}`);
  });

  connection.on('error', (error) => {
    console.error(`[VOICE] Voice connection ERROR in ${voiceChannel.name}:`, error);
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    console.log(`[VOICE] Voice connection DESTROYED for guild ${guildId}`);
    activeSessions.delete(guildId);
  });

  // Only attempt recovery on disconnect; do NOT auto-destroy unless recovery fails badly.
  // This prevents the bot from randomly leaving the channel.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn(
      `[VOICE] ⚠️ Voice connection DISCONNECTED in ${voiceChannel.name}. Trying to recover...`,
    );
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 10_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 10_000),
      ]);
      console.log(`[VOICE] Recovered connection in ${voiceChannel.name}`);
    } catch (error) {
      console.error(`[VOICE] Failed to recover voice connection in ${voiceChannel.name}.`, error);
      // Do not destroy here — let the user call /voice stop or we can add manual leave later.
      // Leaving it allows the session to potentially continue if Discord recovers.
    }
  });

  // Cache the persisted opt-out set at session start. /voice optout|optin
  // refreshes this cache live for all active sessions.
  const optOutSet = new Set(await fetchAllVoiceOptOuts());

  const startedAt = new Date();

  // Continuous per-user recording (#79): one Manual subscription per user,
  // teed into rotating 5-min chunk WAVs (batch-transcribed at /voice stop)
  // and a silence segmenter that emits per-utterance WAVs for live captions.
  // The utterance callback runs the same live-caption pipeline (size skip,
  // quality guards, thread post) the old AfterSilence path used.
  const recorder = new SessionRecorder(
    guildId,
    startedAt.getTime(),
    (uid) => session.optOutSet.has(uid),
    (wavPath, _uid, username) => {
      // Track the async caption transcription so /voice stop can drain
      // in-flight work before finalizing (same contract as before, #82).
      const work = handleUtteranceFile(session, wavPath, username).catch((err) => {
        console.error(`[VOICE] Live-caption pipeline error for ${username}:`, err);
      });
      session.pendingTranscriptions.add(work);
      void work.finally(() => {
        session.pendingTranscriptions.delete(work);
      });
    },
  );

  const session: VoiceSession = {
    connection,
    client,
    guildId,
    channelId: voiceChannel.id,
    channelName: voiceChannel.name,
    startedAt,
    speakingEvents: [],
    transcripts: [],
    audioPaths: [],
    localTranscriptions: 0,
    openaiTranscriptions: 0,
    estimatedAudioSeconds: 0,
    pendingTranscriptions: new Set(),
    optOutSet,
    notifiedUserIds: new Set(),
    recorder,
  };
  activeSessions.set(guildId, session);

  // Consent notice: tell everyone currently on the call that recording +
  // transcription started (mid-session joiners are handled by the
  // voiceStateUpdate listener using the same mechanism).
  await sendRecordingNotice(session, [...voiceChannel.members.values()]).catch((e: any) => {
    console.warn('[VOICE] Failed to send session-start recording notice:', e?.message || e);
  });

  // Post the announcement in the configured transcript channel (the one "it's in now").
  // If that ID is already a thread (e.g. 1499605799947735071), use it directly as the live transcript container.
  // Otherwise send announcement + create a dedicated sub-thread for the convo.
  const announceId = process.env.VOICE_TRANSCRIPT_CHANNEL_ID || process.env.GENERAL_CHAT_CHANNEL_ID;
  console.log(`[VOICE] Announcement channel ID from env: ${announceId}`);
  if (announceId && client) {
    try {
      const ch: any = await client.channels.fetch(announceId).catch((e: any) => {
        console.warn('Fetch announce ch failed:', e);
        return null;
      });
      console.log(`[VOICE] Fetched announce channel: ${ch ? ch.id + ' type:' + ch.type : 'null'}`);
      if (ch && 'send' in ch && ch.type !== ChannelType.GuildVoice) {
        const isAlreadyThread =
          ch.type === ChannelType.GuildPublicThread ||
          ch.type === ChannelType.GuildPrivateThread ||
          (typeof ch.isThread === 'function' && ch.isThread());
        const startMsg = await ch
          .send(
            `🎙️ **GitFitBot joined \`${voiceChannel.name}\`** and is now transcribing + recording.\n` +
              `Started by <@${interaction.user.id}>. Run \`/voice stop\` when finished to save & ingest to Conduit.\n` +
              `Live transcript will be in this thread.`,
          )
          .catch((e: any) => {
            console.warn('Send startMsg failed:', e);
            return null;
          });

        if (startMsg) {
          session.startMessage = startMsg;

          if (isAlreadyThread) {
            // Use the existing thread directly (can't nest threads). This satisfies "thread in the channel that its in now".
            session.transcriptThread = ch;
            console.log(
              `[VOICE] Using existing thread ${ch.id} (${ch.name || 'unnamed'}) directly for live transcript segments.`,
            );
            // Post the helper note as a normal message right after the joined announcement in the thread.
            // All live voice segments will then appear sequentially in this thread (Discord doesn't have Slack-style nested sub-threads; replies give visual nesting but linear posting in the thread is cleaner here).
            const allLiveMsg = await ch
              .send(`All live segments for this VC session will appear here.`)
              .catch(() => null);
            if (allLiveMsg) session.allLiveMessage = allLiveMsg;
          } else {
            try {
              const thread = await startMsg.startThread({
                name: `Transcription - ${voiceChannel.name}`,
                autoArchiveDuration: 1440,
              });
              session.transcriptThread = thread;
              console.log(
                `[VOICE] Created transcript thread ${thread.id} in channel ${announceId}`,
              );
              const allLiveMsg = await thread
                .send(`All live segments will appear here for the full conversation.`)
                .catch(() => null);
              if (allLiveMsg) session.allLiveMessage = allLiveMsg;
            } catch (threadErr) {
              console.warn(
                '[VOICE] Could not start thread for transcription (using announce ch as fallback):',
                threadErr,
              );
              session.transcriptThread = ch;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[VOICE] Failed to announce start:', e);
    }
  }

  console.log(`[VOICE] Session started in guild ${guildId} channel ${voiceChannel.id}`);

  const receiver = connection.receiver;

  // Clean up any previous listeners to prevent accumulation on reconnects or re-joins
  receiver.speaking.removeAllListeners('start');
  receiver.speaking.removeAllListeners('end');

  // Prevent MaxListenersExceededWarning when multiple speaking events or reconnects happen
  (receiver.speaking as any).setMaxListeners?.(100);

  receiver.speaking.on('start', (userId: string) => {
    const member = guild.members.cache.get(userId) as GuildMember | undefined;
    const username = member?.user?.username ?? userId;
    console.log(`[VOICE] ${username} (${userId}) started speaking in ${voiceChannel.name}`);

    // Consent: never subscribe to (or record/transcribe) opted-out users.
    // We still log the speaking event (flagged) so the participants list can
    // show them as "(not transcribed)".
    if (session.optOutSet.has(userId)) {
      console.log(`[VOICE] ${username} (${userId}) is opted out — skipping audio capture.`);
      session.speakingEvents.push({
        userId,
        username,
        started: new Date(),
        optedOut: true,
      });
      return;
    }

    session.speakingEvents.push({
      userId,
      username,
      started: new Date(),
    });

    // Continuous capture (#79): first speaking event subscribes the user with
    // EndBehaviorType.Manual and tees decoded PCM into rotating chunk WAVs +
    // the utterance segmenter (live captions). Subsequent events are no-ops.
    // (Two parallel receiver subscriptions per user are NOT possible:
    // VoiceReceiver.subscribe() returns the existing stream for a user, so the
    // old AfterSilence path could not coexist with the continuous one — see
    // the architecture note in src/utils/voiceRecorder.ts.)
    session.recorder.ensureUser(receiver, userId, username);
  });

  receiver.speaking.on('end', (userId: string) => {
    const evt = session.speakingEvents.findLast((e) => e.userId === userId && !e.ended);
    if (evt) evt.ended = new Date();
    const member = guild.members.cache.get(userId);
    console.log(`[VOICE] ${member?.user?.username ?? userId} stopped speaking`);
  });

  // Announce in a text channel if possible (use general or a log channel)
  // For now console + followUp already done. In prod post to GENERAL or dedicated transcript channel.

  console.log(`[VOICE] Session started in guild ${guildId} channel ${voiceChannel.id}`);
}

/**
 * Live-caption pipeline for one utterance WAV (emitted by the recorder's
 * silence segmenter). This is the old per-utterance AfterSilence path,
 * unchanged in behavior: <15KB skip, transcription, JSON/gibberish/low-value
 * guards, near-duplicate suppression, and the thread caption post. These
 * guards stay HERE only — the final transcript comes from the clean batch
 * pass over the continuous chunks at /voice stop (#79).
 */
async function handleUtteranceFile(
  session: VoiceSession,
  filePath: string,
  username: string,
): Promise<void> {
  session.audioPaths.push(filePath);

  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  const sizeKb = stats ? Math.round(stats.size / 1024) : 0;

  console.log(`[VOICE] Utterance WAV ready for ${username} (size=${sizeKb}KB) at ${filePath}`);

  if (!stats || sizeKb < 15) {
    console.log(
      `[VOICE] ⚠️ Skipping tiny clip (${sizeKb}KB < 15KB) for ${username} (too short for reliable STT)`,
    );
    return;
  }

  console.log(`[VOICE] Starting transcription for ${username}...`);
  const text = await transcribeAudio(filePath, username, session);
  const cleaned = (text || '').trim();
  const ts = new Date().toISOString().slice(11, 19);

  // Track audio usage for cost awareness
  const audioSeconds = Math.round(stats.size / 192000); // approx for 48kHz stereo 16-bit
  session.estimatedAudioSeconds = (session.estimatedAudioSeconds || 0) + audioSeconds;

  const looksLikeWhisperJson =
    cleaned.startsWith('{') ||
    cleaned.includes('"text"') ||
    cleaned.includes('"segments"') ||
    /"language"\s*:\s*"/.test(cleaned);

  const isLowValue =
    !cleaned ||
    looksLikeWhisperJson ||
    cleaned.includes('transcription failed') ||
    cleaned.includes('no speech') ||
    cleaned.includes('no usable') ||
    cleaned.trim().length < 1;

  if (isLowValue) {
    console.log(
      `[VOICE] ⚠️ Dropped low-value segment for ${username}: ${cleaned.substring(0, 60)}`,
    );
    return;
  }

  // Anti-repetition: skip near-duplicates of recent lines (common with Whisper on short/noisy clips)
  const recentTexts = session.transcripts
    .slice(-3)
    .map((line) => line.split(': ').slice(1).join(': ').toLowerCase());
  const norm = cleaned.toLowerCase().trim();
  const isRepeat = recentTexts.some(
    (prev) =>
      prev &&
      (norm.includes(prev) || prev.includes(norm)) &&
      Math.abs(norm.length - prev.length) < 30,
  );
  if (isRepeat) {
    console.log(
      `[VOICE] ⚠️ Dropped near-duplicate transcription for ${username}: ${cleaned.substring(0, 60)}`,
    );
    return;
  }

  session.transcripts.push(`[${ts}] ${username}: ${cleaned}`);
  console.log(
    `[VOICE] ✅ Transcribed ${username}: ${cleaned.substring(0, 80)}${cleaned.length > 80 ? '...' : ''}`,
  );

  // Live caption ONLY for useful text -> the target (thread preferred)
  // This is the key to "live transcript in the thread"
  if (session.client) {
    let target: any = session.transcriptThread;
    if (!target) {
      const chId =
        process.env.VOICE_TRANSCRIPT_CHANNEL_ID || process.env.GENERAL_CHAT_CHANNEL_ID || '';
      if (chId) {
        target = await session.client.channels.fetch(chId).catch(() => null);
      }
    }
    if (target && 'send' in target) {
      const tgtId =
        (session.transcriptThread && session.transcriptThread.id) ||
        process.env.VOICE_TRANSCRIPT_CHANNEL_ID ||
        process.env.GENERAL_CHAT_CHANNEL_ID;
      console.log(`[VOICE] Sending live caption for ${username} to ${tgtId}`);

      // Send as a normal message in the transcript thread.
      // Since Discord threads don't support sub-threads like Slack, this is the natural way:
      // all content lives linearly in the thread after the "All live segments" header.
      await target.send(`🎙️ **${username}**: ${cleaned}`).catch((e: any) => {
        console.warn('[VOICE] live send failed:', e?.message || e);
      });
    }
  }
}

async function stopAndIngest(interaction: CommandInteraction) {
  const guild = interaction.guild!;
  const session = activeSessions.get(guild.id);
  if (!session) {
    await interaction.followUp({
      content: 'No active voice transcription session for this guild.',
    });
    return;
  }

  const { connection, channelName, startedAt, speakingEvents } = session;

  // Destroying the connection stops new speaking events and fires the Destroyed
  // handler (which removes the session from activeSessions). We keep using our
  // local `session` reference — do NOT re-fetch it from the map after this point.
  connection.destroy();
  activeSessions.delete(guild.id);

  const endedAt = new Date();

  await interaction.followUp({
    content: 'Session ended — finalizing transcript (waiting for in-flight transcriptions)…',
  });

  // Close all continuous recordings first: this finalizes every chunk WAV on
  // disk and flushes any in-progress utterance (whose caption transcription
  // gets registered in pendingTranscriptions before stopAll resolves), so the
  // drain below covers it.
  const recordedChunks = await session.recorder.stopAll().catch((e: any) => {
    console.warn('[VOICE] Recorder stop failed:', e?.message || e);
    return [] as ChunkMeta[];
  });

  // Drain in-flight transcriptions (ffmpeg close handlers + queued Whisper calls)
  // before building the final transcript, with a hard cap so a wedged Whisper
  // call can never hang the stop forever.
  const DRAIN_TIMEOUT_MS = 180_000; // 3 minutes
  let droppedSegments = 0;
  if (session.pendingTranscriptions.size > 0) {
    console.log(
      `[VOICE] Draining ${session.pendingTranscriptions.size} in-flight transcription(s) (max ${DRAIN_TIMEOUT_MS / 1000}s)...`,
    );
    let drainTimer: NodeJS.Timeout | undefined;
    const raceResult = await Promise.race([
      Promise.allSettled([...session.pendingTranscriptions]).then(() => 'drained' as const),
      new Promise<'timeout'>((resolve) => {
        drainTimer = setTimeout(() => resolve('timeout'), DRAIN_TIMEOUT_MS);
      }),
    ]);
    if (drainTimer) clearTimeout(drainTimer);
    if (raceResult === 'timeout') {
      droppedSegments = session.pendingTranscriptions.size;
      console.warn(
        `[VOICE] ⚠️ Drain timed out after ${DRAIN_TIMEOUT_MS / 1000}s with ${droppedSegments} transcription(s) still pending. Finalizing without them.`,
      );
    } else {
      console.log('[VOICE] All in-flight transcriptions drained.');
    }
  }
  const durationMin = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

  // Build transcript from actual captured + transcribed audio when available.
  // Opted-out users are listed as "(not transcribed)" — they spoke but were
  // never captured or transcribed.
  const participantTranscribed = new Map<string, boolean>();
  for (const e of speakingEvents) {
    const wasTranscribed = participantTranscribed.get(e.username) ?? false;
    participantTranscribed.set(e.username, wasTranscribed || !e.optedOut);
  }
  const participants = [...participantTranscribed.entries()].map(([name, transcribed]) =>
    transcribed ? name : `${name} (not transcribed)`,
  );
  const eventsSummary = speakingEvents
    .map((e) => {
      const dur = e.ended ? Math.round((e.ended.getTime() - e.started.getTime()) / 1000) : '?';
      const optedOutNote = e.optedOut ? ' (opted out — not captured/transcribed)' : '';
      return `- ${e.username}: spoke ~${dur}s starting ${e.started.toISOString()}${optedOutNote}`;
    })
    .join('\n');

  // Live-caption transcript (grouped by speaker) — kept as the raw record and
  // as the fallback if the batch pass over the full recording produces nothing.
  let liveCaptionTranscript =
    'No transcribed segments (check OPENAI_API_KEY or audio files in ./audio)';
  if (session.transcripts && session.transcripts.length > 0) {
    const grouped: Array<{ speaker: string; lines: string[] }> = [];
    let currSpeaker = '';
    let currLines: string[] = [];
    for (const line of session.transcripts) {
      // lines are like "[timestamp] Speaker: text" or "[Speaker] text"
      const m = line.match(/^\[.*?\]?\s*(.+?):\s*(.*)$/);
      const speaker = m && m[1] ? m[1].trim() : 'Unknown';
      const content = m && m[2] !== undefined ? m[2].trim() : line;
      if (speaker !== currSpeaker) {
        if (currSpeaker) grouped.push({ speaker: currSpeaker, lines: currLines });
        currSpeaker = speaker;
        currLines = [];
      }
      currLines.push(content);
    }
    if (currSpeaker) grouped.push({ speaker: currSpeaker, lines: currLines });
    liveCaptionTranscript = grouped
      .map((g) => `**${g.speaker}:**\n${g.lines.join('\n')}`)
      .join('\n\n');
  }
  if (droppedSegments > 0) {
    liveCaptionTranscript += `\n\n⚠️ ${droppedSegments} caption segment(s) were still transcribing at stop and were dropped (drain timed out after ${DRAIN_TIMEOUT_MS / 1000}s).`;
  }

  // Batch pass over the continuous chunk recordings (#79): full-quality
  // transcription of everything captured, merged across users by chunk start
  // time. This becomes the final transcript; live captions are kept for
  // comparison. Falls back to live captions when no chunks transcribed.
  const batch = await transcribeSessionRecordings(session, recordedChunks);
  const usedBatchTranscript = batch.merged !== null;
  const realTranscripts = batch.merged ?? liveCaptionTranscript;

  const localCount = session.localTranscriptions || 0;
  const openaiCount = session.openaiTranscriptions || 0;
  const totalSeconds = session.estimatedAudioSeconds || 0;
  const roughCost = (openaiCount * 0.006).toFixed(4); // very rough, since OpenAI Whisper ~$0.006/min

  const transcriptStub =
    `# Voice Session Transcript (GitFitBot → Conduit)\n\n` +
    `**Channel**: ${channelName}\n` +
    `**Started**: ${startedAt.toISOString()}\n` +
    `**Ended**: ${endedAt.toISOString()}\n` +
    `**Duration**: ~${durationMin} min\n` +
    `**Participants**: ${participants.join(', ') || 'none detected'}\n\n` +
    `## Usage & Cost (for visibility)\n` +
    `- Local transcriptions: ${localCount}\n` +
    `- OpenAI Whisper calls: ${openaiCount}\n` +
    `- Estimated audio processed: ~${Math.round(totalSeconds)}s\n` +
    `- Rough OpenAI cost (if any): $${roughCost} (only counts OpenAI path)\n` +
    `- Batch pass: ${batch.note}\n\n` +
    `## Transcribed conversation\n${realTranscripts}\n\n` +
    `## Live captions (raw)\n${liveCaptionTranscript}\n\n` +
    `## Raw speaking events\n${eventsSummary || 'No events'}\n\n` +
    `**Session recording dir**: ${session.recorder.sessionDir}\n` +
    `**Utterance audio files**: ${session.audioPaths?.join(', ') || 'none'}\n` +
    `**Note**: Audio is recorded continuously per user in 5-minute chunks; the "Transcribed conversation" above comes from a full-quality batch pass over those chunks at stop${usedBatchTranscript ? '' : ' (batch produced nothing — live captions used as fallback)'}. Prefer local Whisper to avoid costs. Local errors fall back to OpenAI.\n`;

  // Ingest to conduit (best effort using Supabase if configured, else local export)
  const ingestResult = await ingestToConduit({
    title: `Discord VC: ${channelName} @ ${startedAt.toISOString().slice(0, 16)}`,
    body: transcriptStub,
    source_type: 'discord_voice_transcript',
    metadata: {
      guild_id: guild.id,
      channel_id: session.channelId,
      channel_name: channelName,
      started_at: startedAt,
      ended_at: endedAt,
      participants,
      event_count: speakingEvents.length,
      bot: 'gitfitbot',
      version: 'voice-v0.1',
    },
  });

  // Also dump to local for review (like other digests)
  const fs = await import('fs/promises');
  const path = await import('path');
  const exportDir = path.join(process.cwd(), 'exports', 'voice');
  await fs.mkdir(exportDir, { recursive: true });
  const slug = `${channelName.replace(/\s+/g, '-')}-${startedAt.toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  const filePath = path.join(exportDir, `${slug}.md`);
  await fs.writeFile(filePath, transcriptStub, 'utf8');

  const summary =
    `**Session ended.** Duration ~${durationMin}m. ` +
    `Transcript saved to ${filePath}. Ingest status: ${ingestResult.ok ? 'OK (doc ID: ' + (ingestResult.id ?? 'unknown') + ')' : 'logged (no full conduit yet)'}.\n\n` +
    `Final transcript: ${usedBatchTranscript ? `batch pass over ${recordedChunks.length} recorded chunk(s)` : 'live captions (batch pass produced nothing)'}.\n` +
    `Usage: ${localCount} local + ${openaiCount} OpenAI transcriptions (~${Math.round(totalSeconds)}s audio). Rough OpenAI cost ~$${roughCost}.\n` +
    `Recording dir: ${session.recorder.sessionDir}`;

  await interaction.followUp({ content: summary });

  // Post summary to the session thread if exists (for the full convo), else to transcript channel
  let summaryTarget: any = session.transcriptThread;
  if (!summaryTarget) {
    const annId = process.env.VOICE_TRANSCRIPT_CHANNEL_ID || process.env.GENERAL_CHAT_CHANNEL_ID;
    if (annId && session.client) {
      summaryTarget = await session.client.channels.fetch(annId).catch(() => null);
    }
  }
  if (summaryTarget && 'send' in summaryTarget) {
    const summaryContent =
      `✅ **Transcription session in \`${channelName}\` ended.**\n` +
      `Duration: ~${durationMin}m | Live segments: ${session.transcripts?.length || 0} | Recorded chunks: ${recordedChunks.length}\n` +
      `Usage: ${localCount} local + ${openaiCount} OpenAI (~${Math.round(totalSeconds)}s). Rough OpenAI cost ~$${roughCost}.\n` +
      `${ingestResult.ok ? '✅ Ingested to Conduit (doc ID logged in bot)' : '⚠️ Ingest may have failed — check logs'}\n` +
      `Full transcript saved locally too.`;
    const refId = session.startMessage?.id;
    const payload: any = { content: summaryContent };
    if (refId) {
      payload.messageReference = { messageId: refId };
    }
    await summaryTarget.send(payload).catch(() => {});
  }

  console.log(`[VOICE] Session fully ended for guild ${guild.id}. Ingest result:`, ingestResult);
}

async function showStatus(interaction: CommandInteraction) {
  const guild = interaction.guild!;
  const session = activeSessions.get(guild.id);

  let content = 'No active voice transcription session for this guild.';
  if (session) {
    const durationMin = Math.round((Date.now() - session.startedAt.getTime()) / 60000);
    const segs = session.transcripts?.length || 0;
    const files = session.audioPaths?.length || 0;
    content =
      `**Active session in ${session.channelName}**\n` +
      `Started: ${session.startedAt.toISOString()} (~${durationMin}m ago)\n` +
      `Segments transcribed (live captions): ${segs}\n` +
      `Utterance audio files: ${files}\n` +
      `Continuous recording chunks: ${session.recorder.chunks.length} (dir: ${session.recorder.sessionDir})\n` +
      `Local transcriptions: ${session.localTranscriptions || 0} | OpenAI: ${session.openaiTranscriptions || 0}\n` +
      `Est. audio: ~${Math.round(session.estimatedAudioSeconds || 0)}s\n` +
      `Use \`/voice stop\` to end and ingest to Conduit, or \`/voice leave\` to force disconnect.`;
  }

  await interaction.followUp({ content, ephemeral: true });
}

async function forceLeave(interaction: CommandInteraction) {
  const guild = interaction.guild!;
  const session = activeSessions.get(guild.id);

  if (!session) {
    await interaction.followUp({
      content: 'No active voice transcription session for this guild.',
      ephemeral: true,
    });
    return;
  }

  try {
    session.connection.destroy();
  } catch (e) {
    console.warn('[VOICE] Error during force leave destroy:', e);
  }
  activeSessions.delete(guild.id);

  await interaction.followUp({
    content: `Force left voice channel ${session.channelName}. Session cleared (no ingest performed).`,
  });

  // Also announce
  const announceId = process.env.VOICE_TRANSCRIPT_CHANNEL_ID || process.env.GENERAL_CHAT_CHANNEL_ID;
  if (announceId && session.client) {
    try {
      const ch = await session.client.channels.fetch(announceId).catch(() => null);
      if (ch && 'send' in ch && (ch as any).type !== ChannelType.GuildVoice) {
        await (ch as any)
          .send(
            `🛑 **Force left** voice transcription session in \`${session.channelName}\` (no ingest).`,
          )
          .catch(() => {});
      }
    } catch {}
  }

  console.log(`[VOICE] Force left session for guild ${guild.id}`);
}

/**
 * Batch transcription pass over the continuous chunk recordings (#79).
 *
 * Runs each recorded chunk (chronological across all users) through
 * transcribeAudio — which already handles local-Whisper serialization, the
 * OpenAI fallback, and segment quality filtering — and merges the results by
 * chunk start time into "[HH:MM:SS] username: text" lines.
 *
 * Posts a "processing…" message to the session thread and edits it when done.
 * Total batch time is capped at 15 minutes; on timeout, whatever completed is
 * kept and the remaining chunks are reported (with file paths) as unprocessed.
 *
 * Returns merged === null when nothing was transcribed (no chunks / all
 * failed) so the caller can fall back to the live-caption transcript.
 */
const BATCH_TRANSCRIBE_TIMEOUT_MS = 15 * 60 * 1000;

async function transcribeSessionRecordings(
  session: VoiceSession,
  chunks: ChunkMeta[],
): Promise<{ merged: string | null; note: string }> {
  const usable = chunks.filter((c) => {
    try {
      return fs.statSync(c.filePath).size > 1024; // skip empty/header-only WAVs
    } catch {
      return false;
    }
  });
  if (usable.length === 0) {
    return { merged: null, note: 'no recorded chunks to batch-transcribe' };
  }

  // Post the "processing" notice to the session thread (or fallback channel).
  let target: any = session.transcriptThread;
  if (!target && session.client) {
    const chId = process.env.VOICE_TRANSCRIPT_CHANNEL_ID || process.env.GENERAL_CHAT_CHANNEL_ID;
    if (chId) {
      target = await session.client.channels.fetch(chId).catch(() => null);
    }
  }
  let processingMsg: any = null;
  if (target && 'send' in target) {
    processingMsg = await target
      .send(
        `⏳ Processing full session recording (${usable.length} chunk(s))… the final transcript will use this clean batch pass.`,
      )
      .catch(() => null);
  }

  const startedProcessing = Date.now();
  const deadline = startedProcessing + BATCH_TRANSCRIBE_TIMEOUT_MS;
  const lines: string[] = [];
  const unprocessed: string[] = [];
  let transcribedCount = 0;

  for (const chunk of usable) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      unprocessed.push(chunk.filePath);
      continue;
    }
    let text: string | null = null;
    let capTimer: NodeJS.Timeout | undefined;
    try {
      // Race each chunk against the remaining global budget. We can't cancel
      // the underlying Whisper call, but we stop waiting for it.
      text = await Promise.race([
        transcribeAudio(chunk.filePath, chunk.username, session),
        new Promise<null>((resolve) => {
          capTimer = setTimeout(() => resolve(null), remaining);
        }),
      ]);
    } catch (err: any) {
      console.error(
        `[VOICE] Batch transcription failed for chunk ${chunk.filePath}:`,
        err?.message || err,
      );
    } finally {
      if (capTimer) clearTimeout(capTimer);
    }
    if (text === null) {
      unprocessed.push(chunk.filePath);
      continue;
    }
    transcribedCount++;
    const cleaned = (text || '').trim();
    const isLowValue =
      !cleaned ||
      cleaned.includes('no speech') ||
      cleaned.includes('transcription failed') ||
      cleaned.includes('transcription error');
    if (isLowValue) continue;
    lines.push(`[${chunk.startedAt.slice(11, 19)}] ${chunk.username}: ${cleaned}`);
  }

  const elapsedSec = Math.round((Date.now() - startedProcessing) / 1000);
  let note = `${transcribedCount}/${usable.length} chunk(s) transcribed in ${elapsedSec}s`;
  if (unprocessed.length > 0) {
    note += `; ⚠️ batch cap (${BATCH_TRANSCRIBE_TIMEOUT_MS / 60000} min) hit — ${unprocessed.length} chunk(s) left unprocessed: ${unprocessed.join(', ')}`;
  }

  if (processingMsg && typeof processingMsg.edit === 'function') {
    const doneContent =
      lines.length > 0
        ? `✅ Full recording processed: ${note}.`
        : `⚠️ Full recording processed but produced no usable text (${note}). Falling back to live captions.`;
    await processingMsg.edit(doneContent.slice(0, 1900)).catch(() => {});
  }

  return { merged: lines.length > 0 ? lines.join('\n') : null, note };
}

/**
 * Transcribe an audio file using OpenAI Whisper (or return placeholder).
 * Prepares for easy swap to self-hosted whisper-live-server WS streaming.
 */
let openaiQuotaExceeded = false;
let localQueue: Promise<any> = Promise.resolve();

async function transcribeAudio(
  filePath: string,
  speaker: string,
  sessionForTracking?: any,
): Promise<string> {
  const fileBuffer = await fs.promises.readFile(filePath);
  const filename = path.basename(filePath) || 'speech.wav';

  const sanitize = (raw: any): string => {
    let s = '';
    if (typeof raw === 'string') s = raw.trim();
    else if (raw && typeof raw === 'object' && 'text' in raw)
      s = String((raw as any).text || '').trim();
    else s = String(raw || '').trim();

    if (!s) return '[no speech detected]';

    // Hard guard: never let the raw Whisper JSON response (or its string form) or weird server echoes become live text
    if (
      s.startsWith('{') &&
      (s.includes('"text"') || s.includes('"segments"') || s.includes('language'))
    ) {
      return '[no speech detected]';
    }
    if (s.includes('"text":') && s.includes('"segments"')) {
      return '[no speech detected]';
    }
    // Drop obvious non-transcript server responses
    if (/^\s*\{.*"language".*\}\s*$/.test(s)) return '[no speech detected]';

    // Drop non-latin short results ONLY if they look like pure server filler (very short, no latin)
    if (s.length > 1 && s.length < 20 && !/[a-zA-Z]/.test(s)) {
      return '[no speech detected]';
    }

    return s; // let short phrases through; the isLowValue in handler will decide live posting
  };

  // Safe body readers to avoid undici AssertionError when body is in bad state (e.g. after abort/timeout)
  const safeText = async (b: any): Promise<string> => {
    if (!b) return '';
    try {
      return await b.text();
    } catch (e: any) {
      return e.message || '';
    }
  };
  const safeJson = async (b: any): Promise<any> => {
    if (!b) return {};
    try {
      return await b.json();
    } catch {
      const txt = await safeText(b);
      return { text: txt };
    }
  };

  // Support local self-hosted Whisper using undici for reliable multipart
  if (process.env.WHISPER_SERVER_URL) {
    const localUrl = process.env.WHISPER_SERVER_URL;
    console.log(`[VOICE] Using local Whisper at ${localUrl} for ${speaker}`);
    const attemptLocal = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000); // 5 minutes - Whisper can be slow
      try {
        const base = localUrl.replace(/\/$/, '');
        // Better params for quality on conversational/noisy audio
        const url = `${base}/asr?output=json&task=transcribe&language=en&vad_filter=true&temperature=0&initial_prompt=This is a casual, informal English voice chat in a Discord call between colleagues. People are discussing work, products, tech, and random things. Use natural language.`;
        const form = new FormData();
        form.append('audio_file', new Blob([fileBuffer]), filename);

        // Use undici request with explicit signal for timeout control
        const { body, statusCode } = await request(url, {
          method: 'POST',
          body: form as any,
          signal: controller.signal,
        });

        if (statusCode < 200 || statusCode >= 300) {
          const err = await safeText(body);
          console.error('Local whisper /asr error:', err);
          return null;
        } else {
          const data: any = await safeJson(body);

          // Prefer good segments if available (the server returns them)
          let t = '';
          if (data.segments && Array.isArray(data.segments)) {
            const good = data.segments.filter(
              (seg: any) => (seg.avg_logprob || -2) > -1.0 && (seg.no_speech_prob || 1) < 0.6,
            );
            if (good.length > 0) {
              t = good
                .map((seg: any) => seg.text || '')
                .join(' ')
                .trim();
            }
          }
          if (!t) t = (data.text || '').trim();

          const cleanedT = sanitize(t);
          if (cleanedT && !cleanedT.includes('no speech')) {
            if (sessionForTracking) {
              sessionForTracking.localTranscriptions =
                (sessionForTracking.localTranscriptions || 0) + 1;
            }
            return cleanedT;
          }
          return '[no speech detected]';
        }
      } catch (e: any) {
        const msg = e.message || e.code || String(e);
        if (
          e.name === 'AbortError' ||
          e.code === 'UND_ERR_HEADERS_TIMEOUT' ||
          e.code === 'ERR_ASSERTION' ||
          msg.includes('AssertionError') ||
          msg.includes('false == true')
        ) {
          console.error('local transcribe error (timeout or undici body error):', msg);
        } else {
          console.error('local transcribe error', e);
        }
        return null;
      } finally {
        clearTimeout(timeout);
      }
    };

    // Serialize local calls via a queue so we don't overwhelm the local Whisper server
    // (concurrent requests were causing HeadersTimeout / slow responses)
    const queuedLocal = () =>
      localQueue.then(async () => {
        let result = await attemptLocal();
        if (result === null) {
          console.log('[VOICE] Local timed out, retrying once...');
          await new Promise((r) => setTimeout(r, 2000));
          result = await attemptLocal();
        }
        return result;
      });
    localQueue = queuedLocal();
    const result = await localQueue;
    if (result !== null) {
      return result;
    }
    // fall through to OpenAI only if local completely failed twice
  }

  // Fallback to OpenAI (cloud) - use verbose_json for segment quality info
  if (openaiQuotaExceeded || !process.env.OPENAI_API_KEY) {
    if (openaiQuotaExceeded) {
      console.warn('[VOICE] Skipping OpenAI fallback due to previous quota error');
    }
    return `[transcription failed for ${speaker}]`;
  }
  console.log(`[VOICE] Using OpenAI Whisper for ${speaker}`);
  try {
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), filename);
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('language', 'en');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form as any,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => 'could not read error response');
      console.error('OpenAI transcribe error:', err);
      if (err.includes('insufficient_quota')) {
        openaiQuotaExceeded = true;
        console.error(
          '!!! OPENAI QUOTA EXHAUSTED - add billing credits or disable OpenAI fallback to avoid costs. Relying on local Whisper only.',
        );
      }
      return `[transcription failed for ${speaker}]`;
    }
    const data: any = await res.json().catch(() => ({}));
    let t = (data.text || '').trim();
    if (data.segments && Array.isArray(data.segments)) {
      const good = data.segments.filter(
        (seg: any) => (seg.avg_logprob || -2) > -1.0 && (seg.no_speech_prob || 1) < 0.6,
      );
      if (good.length > 0)
        t = good
          .map((seg: any) => seg.text || '')
          .join(' ')
          .trim();
    }
    const cleanedT = sanitize(t);
    if (cleanedT && !cleanedT.includes('no speech')) {
      if (sessionForTracking) {
        sessionForTracking.openaiTranscriptions =
          (sessionForTracking.openaiTranscriptions || 0) + 1;
      }
      return cleanedT;
    }
    return '[no speech detected]';
  } catch (e: any) {
    console.error('transcribe error', e);
    return `[transcription error for ${speaker}: ${e.message}]`;
  }
}

/**
 * Ingest helper: tries Supabase (conduit schema source_documents) if env present, else logs.
 * Matches the conduit.read model used across your stack (chip etc).
 */
async function ingestToConduit(doc: {
  title: string;
  body: string;
  source_type: string;
  metadata: Record<string, any>;
}) {
  // Use CONDUIT_ prefixed creds from fyx/.env for the conduit system if available,
  // falling back to regular SUPABASE for compatibility.
  const SUPABASE_DB_URL = process.env.CONDUIT_SUPABASE_DB_URL || process.env.SUPABASE_DB_URL;
  const SUPABASE_URL = process.env.CONDUIT_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.CONDUIT_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  // Prefer direct pg if available (used by projectsDb and conduit schema)
  if (SUPABASE_DB_URL) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: SUPABASE_DB_URL });
      // Insert into conduit.source_documents if table exists in this Supabase
      const sql = `
        INSERT INTO conduit.source_documents (title, body, source_type, captured_at, metadata)
        VALUES ($1, $2, $3, NOW(), $4)
        RETURNING id
      `;
      const res = await pool.query(sql, [doc.title, doc.body, doc.source_type, doc.metadata]);
      await pool.end();
      console.log('[CONDUIT INGEST] Inserted source_document id=', res.rows[0]?.id);
      return { ok: true, id: res.rows[0]?.id };
    } catch (e: any) {
      console.warn(
        '[CONDUIT INGEST] pg insert failed (table may not exist or perms), falling back:',
        e.message,
      );
    }
  }

  // Fallback: use supabase-js if anon keys present (may be RLS limited for writes)
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await supabase
        .schema('conduit')
        .from('source_documents')
        .insert({
          title: doc.title,
          body: doc.body,
          source_type: doc.source_type,
          captured_at: new Date().toISOString(),
          metadata: doc.metadata,
        })
        .select('id')
        .single();
      if (error) throw error;
      console.log('[CONDUIT INGEST] supabase insert id=', data?.id);
      return { ok: true, id: data?.id };
    } catch (e: any) {
      console.warn('[CONDUIT INGEST] supabase fallback failed:', e.message);
    }
  }

  console.log('[CONDUIT INGEST] (stub) would insert:', JSON.stringify(doc, null, 2).slice(0, 500));
  return { ok: false };
}

/**
 * Permission gate for starting a recording session: requires the role in
 * VOICE_RECORDER_ROLE_ID when set; otherwise falls back to requiring the
 * Administrator permission.
 */
function canStartRecording(interaction: CommandInteraction): boolean {
  const roleId = process.env.VOICE_RECORDER_ROLE_ID;
  if (roleId) {
    // interaction.member can be a GuildMember (roles.cache) or a raw API
    // member (roles: string[]) depending on cache state — handle both.
    const roles: any = (interaction.member as any)?.roles;
    if (roles?.cache) return roles.cache.has(roleId);
    if (Array.isArray(roles)) return roles.includes(roleId);
    return false;
  }
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

/** Persist a user's opt-out/opt-in choice and refresh active session caches. */
async function setVoiceOptOut(interaction: CommandInteraction, optedOut: boolean) {
  const userId = interaction.user.id;
  if (optedOut) {
    await addVoiceOptOut(userId);
  } else {
    await removeVoiceOptOut(userId);
  }

  // Refresh the in-memory cache of every active session so the change takes
  // effect immediately (mid-session opt-outs/opt-ins).
  for (const session of activeSessions.values()) {
    if (optedOut) {
      session.optOutSet.add(userId);
      // Also stop any continuous recording already open for this user —
      // opting out must halt capture immediately, not just future subscribes.
      session.recorder.closeUser(userId, 'opted out');
    } else {
      session.optOutSet.delete(userId);
    }
  }

  const content = optedOut
    ? 'You are now **opted out** of voice capture and transcription. GitFitBot will never subscribe to your audio; you will appear in transcripts as "(not transcribed)". Run `/voice optin` to re-enable.'
    : 'You are now **opted back in** to voice capture and transcription. Run `/voice optout` at any time to be excluded again.';
  await interaction.followUp({ content, ephemeral: true });
}

async function executeRun(interaction: CommandInteraction) {
  const actionOpt = interaction.options.get(COMMAND_VOICE.OPTION_ACTION);
  // For Channel-type options, .get() returns { value: snowflake (the channel ID) }
  // This is the pattern used elsewhere in the bot (e.g. Events command).
  const channelOptRaw = interaction.options.get(COMMAND_VOICE.OPTION_CHANNEL);
  const action = (actionOpt?.value as string) || '';
  const channelOpt = channelOptRaw ? String(channelOptRaw.value) : null;

  if (action === COMMAND_VOICE.ACTION_JOIN) {
    if (!canStartRecording(interaction)) {
      const roleId = process.env.VOICE_RECORDER_ROLE_ID;
      const requirement = roleId
        ? `the <@&${roleId}> role`
        : 'the Administrator permission (no VOICE_RECORDER_ROLE_ID configured)';
      await interaction.followUp({
        content: `You can't start a recording session: starting \`/voice join\` requires ${requirement}. Recording captures and transcribes everyone on the call, so it's restricted.`,
        ephemeral: true,
      });
      return;
    }
    await joinAndListen(interaction.client, interaction, channelOpt);
  } else if (action === COMMAND_VOICE.ACTION_STOP) {
    await stopAndIngest(interaction);
  } else if (action === COMMAND_VOICE.ACTION_STATUS) {
    await showStatus(interaction);
  } else if (action === COMMAND_VOICE.ACTION_LEAVE) {
    await forceLeave(interaction);
  } else if (action === COMMAND_VOICE.ACTION_OPTOUT) {
    await setVoiceOptOut(interaction, true);
  } else if (action === COMMAND_VOICE.ACTION_OPTIN) {
    await setVoiceOptOut(interaction, false);
  } else {
    await interaction.followUp({
      content: 'Unknown action. Use join, stop, status, leave, optout, or optin.',
    });
  }
}

const Voice: SlashCommand = {
  name: COMMAND_VOICE.COMMAND_NAME,
  description: COMMAND_VOICE.COMMAND_DESCRIPTION,
  options: [
    {
      name: COMMAND_VOICE.OPTION_ACTION,
      description: COMMAND_VOICE.OPTION_ACTION_DESCRIPTION,
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: 'join', value: COMMAND_VOICE.ACTION_JOIN },
        { name: 'stop', value: COMMAND_VOICE.ACTION_STOP },
        { name: 'status', value: COMMAND_VOICE.ACTION_STATUS },
        { name: 'leave', value: COMMAND_VOICE.ACTION_LEAVE },
        { name: 'optout', value: COMMAND_VOICE.ACTION_OPTOUT },
        { name: 'optin', value: COMMAND_VOICE.ACTION_OPTIN },
      ],
    },
    {
      name: COMMAND_VOICE.OPTION_CHANNEL,
      description: COMMAND_VOICE.OPTION_CHANNEL_DESCRIPTION,
      type: ApplicationCommandOptionType.Channel,
      channel_types: [ChannelType.GuildVoice],
      required: false,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    try {
      await executeRun(interaction);
    } catch (error: any) {
      console.error('[VOICE CMD ERROR]', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.followUp({ content: 'Voice command error. Check logs.' }).catch(() => {});
      }
    }
  },
};

export default Voice;
