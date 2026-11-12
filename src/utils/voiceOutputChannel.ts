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

import { PermissionFlagsBits } from 'discord.js';

/**
 * Duck-typed surface of a Discord channel for the output permission probe.
 * The real object is a discord.js channel, but only these two members are
 * needed, which keeps the probe unit-testable with fake channels (no Discord).
 */
export interface OutputChannelLike {
  isThread?: () => boolean;
  permissionsFor?: (m: unknown) => { has: (p: bigint) => boolean } | null;
}

/**
 * Human-readable names of the permissions the bot is missing on the output
 * channel; `[]` when the bot has all of them.
 *
 * Required: View Channel, plus Send Messages (regular channels) or Send
 * Messages in Threads (threads — a thread never requires Send Messages).
 *
 * Fails closed: a null/undefined `me`, a channel without `permissionsFor`,
 * or a `permissionsFor` that returns null reports every required permission
 * as missing, so a session can never start against a channel the bot can't
 * provably post to.
 */
export function missingOutputPermissions(channel: OutputChannelLike, me: unknown): string[] {
  const isThread =
    channel != null && typeof channel.isThread === 'function' ? channel.isThread() === true : false;
  const required: Array<{ bit: bigint; name: string }> = [
    { bit: PermissionFlagsBits.ViewChannel, name: 'View Channel' },
    {
      bit: isThread ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
      name: isThread ? 'Send Messages in Threads' : 'Send Messages',
    },
  ];
  // Call as a method: discord.js channels read `this` inside permissionsFor.
  const permissions =
    me != null && channel != null && typeof channel.permissionsFor === 'function'
      ? channel.permissionsFor(me)
      : null;
  if (permissions == null) return required.map((r) => r.name);
  return required.filter((r) => !permissions.has(r.bit)).map((r) => r.name);
}

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
