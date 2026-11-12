/**
 * Output-channel resolution for /voice transcripts.
 *
 * The output channel receives the "joined" announcement, the live transcript
 * segments, and the end-of-session summary/digest. It can be chosen
 * explicitly via the `output` option of `/voice join`; when it isn't given,
 * the historic env-var configuration applies.
 *
 * Pure (no process.env read) so it can be tested directly — see
 * tests/voice-output-channel.test.ts. Callers pass the env vars in.
 */

export interface VoiceOutputEnv {
  VOICE_TRANSCRIPT_CHANNEL_ID?: string | null;
  GENERAL_CHAT_CHANNEL_ID?: string | null;
  // Index signature so `process.env` (NodeJS.ProcessEnv) is assignable as-is.
  [key: string]: string | null | undefined;
}

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolves the voice output channel ID:
 * explicit id (when non-blank) → VOICE_TRANSCRIPT_CHANNEL_ID →
 * GENERAL_CHAT_CHANNEL_ID → undefined.
 *
 * Blank/whitespace-only values at any level are ignored, so a misconfigured
 * whitespace env var can never point the session at a bogus channel.
 */
export function resolveOutputChannelId(
  explicitId: string | null | undefined,
  env: VoiceOutputEnv,
): string | undefined {
  return (
    nonBlank(explicitId) ??
    nonBlank(env.VOICE_TRANSCRIPT_CHANNEL_ID) ??
    nonBlank(env.GENERAL_CHAT_CHANNEL_ID)
  );
}
