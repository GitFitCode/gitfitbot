/**
 * Voice session lifecycle helpers (#83): startup recovery of sessions that
 * were interrupted by a bot restart, and the audio retention policy for the
 * continuous session recordings under ./audio.
 *
 * Recovery is salvage + cleanup only (per the issue): destroy any lingering
 * voice connection, post a "session interrupted" note pointing at the
 * preserved audio dir, and clear the persisted record. No automatic
 * re-transcription is attempted.
 *
 * Retention is configured via VOICE_AUDIO_RETENTION:
 *   - "keep-days:N" (default N=7): session audio dirs are kept and a startup
 *     sweep deletes dirs older than N days.
 *   - "delete": a session's audio dir is deleted immediately after a clean
 *     /voice stop, but ONLY when the local export succeeded AND ingest
 *     succeeded (or ingest is unconfigured). Leftover dirs in this mode are
 *     crash salvage and are never swept.
 */

import { getVoiceConnection } from '@discordjs/voice';
import { ChannelType, Client } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { clearVoiceSession, getStaleVoiceSessions, VoiceSessionRecord } from './localdb';

export type VoiceAudioRetention = { mode: 'delete' } | { mode: 'keep-days'; days: number };

const DEFAULT_RETENTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses VOICE_AUDIO_RETENTION ("delete" | "keep-days:N"). Invalid or unset
 * values fall back to the default keep-days:7.
 */
export function parseVoiceAudioRetention(
  raw: string | undefined = process.env.VOICE_AUDIO_RETENTION,
): VoiceAudioRetention {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return { mode: 'keep-days', days: DEFAULT_RETENTION_DAYS };
  if (value === 'delete') return { mode: 'delete' };
  const match = value.match(/^keep-days:(\d+)$/);
  if (match) {
    const days = parseInt(match[1], 10);
    if (days > 0) return { mode: 'keep-days', days };
  }
  console.warn(
    `[VOICE LIFECYCLE] Invalid VOICE_AUDIO_RETENTION="${raw}" — falling back to keep-days:${DEFAULT_RETENTION_DAYS}.`,
  );
  return { mode: 'keep-days', days: DEFAULT_RETENTION_DAYS };
}

/**
 * Deletes a session's audio dir if retention is "delete". Callers must only
 * invoke this after the local export succeeded AND ingest succeeded (or is
 * unconfigured) — audio is the only remaining source of truth otherwise.
 *
 * @returns {Promise<boolean>} True if the dir was deleted.
 */
export async function maybeDeleteSessionAudio(sessionDir: string): Promise<boolean> {
  if (parseVoiceAudioRetention().mode !== 'delete') return false;
  try {
    await fs.promises.rm(sessionDir, { recursive: true, force: true });
    console.log(`[VOICE LIFECYCLE] Deleted session audio dir (retention=delete): ${sessionDir}`);
    return true;
  } catch (e: any) {
    console.warn(
      `[VOICE LIFECYCLE] Failed to delete session audio dir ${sessionDir}:`,
      e?.message || e,
    );
    return false;
  }
}

/** Posts the "interrupted by restart" note to the session thread (or fallback channel). */
async function postInterruptionNote(client: Client, record: VoiceSessionRecord): Promise<void> {
  const note =
    `⚠️ Transcription session was interrupted by a bot restart. ` +
    `Partial audio preserved at \`${record.audioDir}\` (manifest.json lists chunks). ` +
    `Run /voice join to start a new session.`;

  const candidateIds = [
    record.threadId,
    process.env.VOICE_TRANSCRIPT_CHANNEL_ID,
    process.env.GENERAL_CHAT_CHANNEL_ID,
  ].filter((id): id is string => Boolean(id));

  for (const id of candidateIds) {
    const ch: any = await client.channels.fetch(id).catch(() => null);
    if (ch && 'send' in ch && ch.type !== ChannelType.GuildVoice) {
      const sent = await ch.send(note).then(
        () => true,
        (e: any) => {
          console.warn(
            `[VOICE LIFECYCLE] Failed to post interruption note to ${id}:`,
            e?.message || e,
          );
          return false;
        },
      );
      if (sent) return;
    }
  }
  console.warn(
    `[VOICE LIFECYCLE] Could not post interruption note for guild ${record.guildId} (no reachable thread/channel).`,
  );
}

/**
 * Startup recovery (#83): for every persisted session left behind by the
 * previous process, destroy any lingering voice connection, post the salvage
 * note, and clear the record. Returns the audio dirs of recovered sessions
 * (resolved paths) so the retention sweep never deletes them in the same boot.
 */
export async function recoverStaleVoiceSessions(client: Client): Promise<Set<string>> {
  const preservedDirs = new Set<string>();

  let stale: VoiceSessionRecord[] = [];
  try {
    stale = await getStaleVoiceSessions();
  } catch (e: any) {
    console.warn('[VOICE LIFECYCLE] Could not read persisted voice sessions:', e?.message || e);
    return preservedDirs;
  }

  for (const record of stale) {
    preservedDirs.add(path.resolve(record.audioDir));
    console.warn(
      `[VOICE LIFECYCLE] Stale voice session found for guild ${record.guildId} (started ${record.startedAt}) — recovering (salvage note + cleanup).`,
    );

    // (a) The previous process may have left the bot connected to the VC.
    try {
      const connection = getVoiceConnection(record.guildId);
      if (connection) {
        connection.destroy();
        console.log(
          `[VOICE LIFECYCLE] Destroyed lingering voice connection for guild ${record.guildId}.`,
        );
      }
    } catch (e: any) {
      console.warn(
        `[VOICE LIFECYCLE] Error destroying voice connection for guild ${record.guildId}:`,
        e?.message || e,
      );
    }

    // (b) Tell the session thread what happened and where the audio lives.
    await postInterruptionNote(client, record).catch((e: any) => {
      console.warn('[VOICE LIFECYCLE] Interruption note failed:', e?.message || e);
    });

    // (c) Recovery done — clear the record so the next boot doesn't repeat it.
    await clearVoiceSession(record.guildId).catch((e: any) => {
      console.warn(
        `[VOICE LIFECYCLE] Failed to clear stale session for guild ${record.guildId}:`,
        e?.message || e,
      );
    });
  }

  return preservedDirs;
}

/**
 * Determines when a session dir's recording started, for the retention sweep.
 * Prefers the <guildId>-<sessionStartTs> dir name (see SessionRecorder), then
 * manifest.json's sessionStartTs, then manifest/dir mtime as fallbacks.
 */
function sessionDirStartTime(dirPath: string, dirName: string): number | null {
  const match = dirName.match(/^\d+-(\d+)$/);
  if (match) {
    const ts = Number(match[1]);
    if (Number.isFinite(ts) && ts > 0) return ts;
  }
  try {
    const manifestPath = path.join(dirPath, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (typeof manifest?.sessionStartTs === 'number' && manifest.sessionStartTs > 0) {
      return manifest.sessionStartTs;
    }
    return fs.statSync(manifestPath).mtimeMs;
  } catch {
    // no/unreadable manifest — fall through to dir mtime
  }
  try {
    return fs.statSync(dirPath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Startup retention sweep (#83): in keep-days mode, deletes audio/* session
 * dirs older than the retention window. Dirs in `preservedDirs` (just-recovered
 * sessions this boot) are never deleted. In "delete" mode the sweep is a no-op:
 * leftover dirs there are crash salvage that a human may still want.
 */
export async function sweepOldAudioDirs(
  preservedDirs: Set<string> = new Set(),
  baseAudioDir: string = path.join(process.cwd(), 'audio'),
): Promise<void> {
  const retention = parseVoiceAudioRetention();
  if (retention.mode !== 'keep-days') return;

  const cutoff = Date.now() - retention.days * MS_PER_DAY;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(baseAudioDir, { withFileTypes: true });
  } catch {
    return; // no audio dir yet — nothing to sweep
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue; // loose utterance WAVs are left alone
    const dirPath = path.join(baseAudioDir, entry.name);
    if (preservedDirs.has(path.resolve(dirPath))) continue;

    const startedAt = sessionDirStartTime(dirPath, entry.name);
    if (startedAt === null || startedAt >= cutoff) continue;

    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
      console.log(
        `[VOICE LIFECYCLE] Retention sweep deleted ${dirPath} (older than ${retention.days} day(s)).`,
      );
    } catch (e: any) {
      console.warn(`[VOICE LIFECYCLE] Retention sweep failed for ${dirPath}:`, e?.message || e);
    }
  }
}
