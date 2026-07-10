/**
 * Continuous per-user voice recording for /voice sessions (#79).
 *
 * ARCHITECTURE NOTE — one subscription per user (why we tee):
 * @discordjs/voice's `VoiceReceiver.subscribe()` returns the EXISTING
 * `AudioReceiveStream` when one is already open for that user (its
 * implementation is literally `const existing = this.subscriptions.get(userId);
 * if (existing) return existing;` — the second call's end-behavior options are
 * silently ignored). So we CANNOT hold a continuous (EndBehaviorType.Manual)
 * subscription and a per-utterance (AfterSilence) subscription simultaneously.
 * Instead we hold ONE Manual subscription per user, decode opus → PCM once,
 * and tee the PCM into:
 *   1. rotating 5-minute chunk WAVs (the durable full-session recording used
 *      by the batch transcription pass at /voice stop), and
 *   2. a per-utterance silence segmenter for live captions: Discord stops
 *      sending opus packets while a user is silent, so a >3.5s gap in decoded
 *      PCM arrival marks an utterance boundary — equivalent to the old
 *      AfterSilence(3500) behavior. Each utterance is written to its own
 *      small WAV and handed to the caller's `onUtterance` callback (which
 *      keeps the existing live-caption pipeline: <15KB skip, quality guards,
 *      thread post).
 *
 * Disk layout: audio/<guildId>-<sessionStartTs>/<userId>/chunk-<startEpochMs>.wav
 * plus a manifest.json in the session dir (rewritten on every chunk open/close)
 * so a crash mid-session leaves usable, attributable audio on disk.
 *
 * NOTE on chunk timing: because Discord sends no packets during silence, a
 * chunk file contains only speech (silence gaps are collapsed). Chunks are
 * ordered/attributed by their wall-clock start time, which is what the batch
 * transcript merge uses.
 */

import { AudioReceiveStream, EndBehaviorType, VoiceReceiver } from '@discordjs/voice';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as prism from 'prism-media';

const ffmpegPath: string = require('ffmpeg-static');

export interface ChunkMeta {
  userId: string;
  username: string;
  /** ISO timestamp of (approximately) the first audio written to the chunk. */
  startedAt: string;
  filePath: string;
}

export type UtteranceHandler = (
  wavPath: string,
  userId: string,
  username: string,
  /**
   * Epoch ms when the first audio of this utterance arrived (utterance START).
   * Live captions must be stamped with this, not the transcription completion
   * time — Whisper can finish 20-40s after the words were spoken (#93).
   */
  startedAtMs: number,
) => void;

const CHUNK_ROTATE_MS = 5 * 60 * 1000; // rotate chunk files every 5 minutes
const UTTERANCE_SILENCE_MS = 3500; // same boundary the old AfterSilence path used
const STOP_FLUSH_TIMEOUT_MS = 10_000; // max wait for ffmpeg processes to finish at stop

interface UserRecorderState {
  userId: string;
  username: string;
  opusStream: AudioReceiveStream;
  decoder: prism.opus.Decoder;
  onPcm: (buf: Buffer) => void;
  // Continuous chunk writer
  chunkFfmpeg: ChildProcessWithoutNullStreams | null;
  chunkOpenedAt: number; // epoch ms
  // Per-utterance segmenter (live captions)
  uttFfmpeg: ChildProcessWithoutNullStreams | null;
  uttPath: string | null;
  uttTimer: NodeJS.Timeout | null;
  closed: boolean;
}

function spawnWavWriter(filePath: string): ChildProcessWithoutNullStreams {
  const ffmpeg = spawn(ffmpegPath, [
    '-f',
    's16le',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-i',
    'pipe:0',
    '-f',
    'wav',
    '-y',
    filePath,
  ]);
  ffmpeg.stderr.on('data', () => {
    // uncomment for debug: console.log('ffmpeg:', d.toString());
  });
  return ffmpeg;
}

function safeWrite(proc: ChildProcessWithoutNullStreams | null, buf: Buffer): void {
  try {
    if (proc && !proc.killed && proc.stdin.writable) proc.stdin.write(buf);
  } catch {
    // stdin may race with process exit; audio loss here is at most one frame
  }
}

function safeEndStdin(proc: ChildProcessWithoutNullStreams | null): void {
  try {
    if (proc && !proc.killed && proc.stdin.writable) proc.stdin.end();
  } catch {}
}

export class SessionRecorder {
  readonly sessionDir: string;

  /** Per-chunk metadata (also persisted to manifest.json in the session dir). */
  readonly chunks: ChunkMeta[] = [];

  private readonly users = new Map<string, UserRecorderState>();

  private readonly pendingFfmpegCloses = new Set<Promise<void>>();

  private stopped = false;

  constructor(
    private readonly guildId: string,
    private readonly sessionStartTs: number,
    private readonly isOptedOut: (userId: string) => boolean,
    private readonly onUtterance: UtteranceHandler,
    baseAudioDir: string = path.join(process.cwd(), 'audio'),
  ) {
    this.sessionDir = path.join(baseAudioDir, `${guildId}-${sessionStartTs}`);
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this.persistManifest();
  }

  /**
   * Begins (or continues) continuous capture for a user. Called on every
   * speaking-start event; only the first call per user actually subscribes.
   * Never records opted-out users.
   */
  ensureUser(receiver: VoiceReceiver, userId: string, username: string): void {
    if (this.stopped || this.isOptedOut(userId) || this.users.has(userId)) return;

    let decoder: prism.opus.Decoder;
    try {
      decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
      (decoder as any).setMaxListeners?.(100);
    } catch (err) {
      console.error(`[VOICE REC] Failed to create opus decoder for ${username}:`, err);
      return;
    }

    // Continuous subscription: lives until the user leaves / opts out / stop.
    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });
    (opusStream as any).setMaxListeners?.(100);

    const state: UserRecorderState = {
      userId,
      username,
      opusStream,
      decoder,
      onPcm: () => {},
      chunkFfmpeg: null,
      chunkOpenedAt: 0,
      uttFfmpeg: null,
      uttPath: null,
      uttTimer: null,
      closed: false,
    };
    state.onPcm = (buf: Buffer) => this.handlePcm(state, buf);

    opusStream.pipe(decoder);
    decoder.on('data', state.onPcm);
    decoder.on('error', (err) => {
      console.error(`[VOICE REC] Decoder error for ${username}:`, err?.message || err);
    });
    opusStream.on('error', (err: any) => {
      console.error(`[VOICE REC] Receive stream error for ${username}:`, err?.message || err);
    });

    this.users.set(userId, state);
    console.log(`[VOICE REC] Continuous recording started for ${username} (${userId})`);
  }

  /** True if this user currently has a continuous recording open. */
  isRecording(userId: string): boolean {
    return this.users.has(userId);
  }

  /**
   * Stops capturing a user (left the VC or opted out mid-session): closes
   * their current chunk and flushes any in-progress utterance so its live
   * caption still fires.
   */
  closeUser(userId: string, reason = 'left'): void {
    const state = this.users.get(userId);
    if (!state) return;
    console.log(`[VOICE REC] Closing recording for ${state.username} (${reason})`);
    this.teardownUser(state);
    this.users.delete(userId);
  }

  /**
   * Ends the session: closes every user's streams and chunk files, waits for
   * ffmpeg writers to flush (bounded), persists the final manifest, and
   * returns chunk metadata in chronological order.
   */
  async stopAll(): Promise<ChunkMeta[]> {
    this.stopped = true;
    for (const state of this.users.values()) this.teardownUser(state);
    this.users.clear();

    if (this.pendingFfmpegCloses.size > 0) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.allSettled([...this.pendingFfmpegCloses]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, STOP_FLUSH_TIMEOUT_MS);
        }),
      ]);
      if (timer) clearTimeout(timer);
    }

    this.persistManifest();
    return this.sortedChunks();
  }

  sortedChunks(): ChunkMeta[] {
    return [...this.chunks].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private handlePcm(state: UserRecorderState, buf: Buffer): void {
    if (state.closed || this.stopped) return;
    // Opt-out can flip mid-session between speaking events; never write audio
    // for a user who is now opted out.
    if (this.isOptedOut(state.userId)) return;

    // 1) Continuous chunk writer (rotate every CHUNK_ROTATE_MS of wall time).
    const now = Date.now();
    if (!state.chunkFfmpeg || now - state.chunkOpenedAt >= CHUNK_ROTATE_MS) {
      this.rotateChunk(state, now);
    }
    safeWrite(state.chunkFfmpeg, buf);

    // 2) Utterance segmenter for live captions: a >UTTERANCE_SILENCE_MS gap in
    //    decoded PCM arrival ends the current utterance (Discord sends no
    //    packets during silence).
    if (!state.uttFfmpeg) this.openUtterance(state, now);
    safeWrite(state.uttFfmpeg, buf);
    if (state.uttTimer) clearTimeout(state.uttTimer);
    state.uttTimer = setTimeout(() => this.closeUtterance(state), UTTERANCE_SILENCE_MS);
  }

  private rotateChunk(state: UserRecorderState, now: number): void {
    this.closeChunk(state);

    const userDir = path.join(this.sessionDir, state.userId);
    fs.mkdirSync(userDir, { recursive: true });
    const filePath = path.join(userDir, `chunk-${now}.wav`);

    const ffmpeg = spawnWavWriter(filePath);
    this.trackFfmpegClose(ffmpeg, `chunk ${path.basename(filePath)} (${state.username})`);

    state.chunkFfmpeg = ffmpeg;
    state.chunkOpenedAt = now;
    this.chunks.push({
      userId: state.userId,
      username: state.username,
      startedAt: new Date(now).toISOString(),
      filePath,
    });
    // Persist on open so a crash mid-chunk still leaves the manifest entry
    // pointing at the (partially written but decodable) WAV.
    this.persistManifest();
    console.log(`[VOICE REC] Opened chunk for ${state.username}: ${filePath}`);
  }

  private closeChunk(state: UserRecorderState): void {
    if (!state.chunkFfmpeg) return;
    safeEndStdin(state.chunkFfmpeg);
    state.chunkFfmpeg = null;
  }

  private openUtterance(state: UserRecorderState, now: number): void {
    // Utterance WAVs are transient caption inputs — keep them in the flat
    // audio/ dir (same location/naming the old per-utterance path used).
    const audioDir = path.join(this.sessionDir, '..');
    fs.mkdirSync(audioDir, { recursive: true });
    const uttPath = path.join(audioDir, `${state.userId}-${now}.wav`);

    const ffmpeg = spawnWavWriter(uttPath);
    state.uttFfmpeg = ffmpeg;
    state.uttPath = uttPath;

    const { userId, username } = state;
    const utteranceStartedAtMs = now; // first PCM of this utterance = utterance start (#93)
    const closePromise = new Promise<void>((resolve) => {
      ffmpeg.on('close', () => {
        try {
          this.onUtterance(uttPath, userId, username, utteranceStartedAtMs);
        } catch (err) {
          console.error(`[VOICE REC] onUtterance handler error for ${username}:`, err);
        }
        resolve();
      });
      ffmpeg.on('error', (err) => {
        console.error(`[VOICE REC] Utterance ffmpeg error for ${username}:`, err);
        resolve();
      });
    });
    this.pendingFfmpegCloses.add(closePromise);
    void closePromise.finally(() => this.pendingFfmpegCloses.delete(closePromise));
  }

  private closeUtterance(state: UserRecorderState): void {
    if (state.uttTimer) {
      clearTimeout(state.uttTimer);
      state.uttTimer = null;
    }
    if (!state.uttFfmpeg) return;
    safeEndStdin(state.uttFfmpeg);
    state.uttFfmpeg = null;
    state.uttPath = null;
  }

  private teardownUser(state: UserRecorderState): void {
    if (state.closed) return;
    state.closed = true;
    try {
      state.decoder.off('data', state.onPcm);
    } catch {}
    try {
      state.opusStream.destroy(); // Manual streams only end when destroyed
    } catch {}
    try {
      if (!state.decoder.destroyed) state.decoder.destroy();
    } catch {}
    this.closeUtterance(state);
    this.closeChunk(state);
  }

  private trackFfmpegClose(ffmpeg: ChildProcessWithoutNullStreams, label: string): void {
    const closePromise = new Promise<void>((resolve) => {
      ffmpeg.on('close', (code) => {
        console.log(`[VOICE REC] ffmpeg closed for ${label} (code=${code})`);
        this.persistManifest();
        resolve();
      });
      ffmpeg.on('error', (err) => {
        console.error(`[VOICE REC] ffmpeg error for ${label}:`, err);
        resolve();
      });
    });
    this.pendingFfmpegCloses.add(closePromise);
    void closePromise.finally(() => this.pendingFfmpegCloses.delete(closePromise));
  }

  private persistManifest(): void {
    const manifest = {
      guildId: this.guildId,
      sessionStartTs: this.sessionStartTs,
      updatedAt: new Date().toISOString(),
      chunks: this.sortedChunks(),
    };
    try {
      fs.writeFileSync(
        path.join(this.sessionDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
    } catch (err: any) {
      console.warn('[VOICE REC] Failed to persist manifest:', err?.message || err);
    }
  }
}
