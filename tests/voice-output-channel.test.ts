import { PermissionFlagsBits } from 'discord.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  interruptionNoteCandidateIds,
  missingOutputPermissions,
  resolveOutputChannelId,
} from '../src/utils/voiceOutputChannel';

const NO_ENV = {};
const ENV_TRANSCRIPT = { VOICE_TRANSCRIPT_CHANNEL_ID: '111' };
const ENV_GENERAL = { GENERAL_CHAT_CHANNEL_ID: '222' };
const BOTH_ENV = { VOICE_TRANSCRIPT_CHANNEL_ID: '111', GENERAL_CHAT_CHANNEL_ID: '222' };

test('explicit output channel id wins over env fallbacks', () => {
  assert.equal(resolveOutputChannelId('999', BOTH_ENV), '999');
  assert.equal(resolveOutputChannelId('999', ENV_TRANSCRIPT), '999');
  assert.equal(resolveOutputChannelId('999', NO_ENV), '999');
});

test('falls back to VOICE_TRANSCRIPT_CHANNEL_ID when no explicit id is given', () => {
  assert.equal(resolveOutputChannelId(undefined, BOTH_ENV), '111');
  assert.equal(resolveOutputChannelId(null, BOTH_ENV), '111');
});

test('falls back to GENERAL_CHAT_CHANNEL_ID when the transcript channel is unset', () => {
  assert.equal(resolveOutputChannelId(undefined, ENV_GENERAL), '222');
  assert.equal(resolveOutputChannelId(null, ENV_GENERAL), '222');
});

test('returns undefined when nothing is set', () => {
  assert.equal(resolveOutputChannelId(undefined, NO_ENV), undefined);
  assert.equal(resolveOutputChannelId(null, {}), undefined);
  assert.equal(
    resolveOutputChannelId(undefined, {
      VOICE_TRANSCRIPT_CHANNEL_ID: '',
      GENERAL_CHAT_CHANNEL_ID: '',
    }),
    undefined,
  );
});

test('ignores blank or whitespace-only explicit ids', () => {
  assert.equal(resolveOutputChannelId('', BOTH_ENV), '111');
  assert.equal(resolveOutputChannelId('   ', BOTH_ENV), '111');
  assert.equal(resolveOutputChannelId('\t ', ENV_GENERAL), '222');
  assert.equal(resolveOutputChannelId('   ', NO_ENV), undefined);
});

test('ignores whitespace-only env values', () => {
  assert.equal(
    resolveOutputChannelId(undefined, {
      VOICE_TRANSCRIPT_CHANNEL_ID: '   ',
      GENERAL_CHAT_CHANNEL_ID: '222',
    }),
    '222',
  );
  assert.equal(
    resolveOutputChannelId(undefined, {
      VOICE_TRANSCRIPT_CHANNEL_ID: '   ',
      GENERAL_CHAT_CHANNEL_ID: '   ',
    }),
    undefined,
  );
});

// --- missingOutputPermissions (permission probe for the /voice output channel) ---

const BOT = { id: 'bot-user' };

function granted(...bits: bigint[]) {
  return { has: (p: bigint) => bits.includes(p) };
}

function textChannel(...bits: bigint[]) {
  return { isThread: () => false, permissionsFor: () => granted(...bits) };
}

function threadChannel(...bits: bigint[]) {
  return { isThread: () => true, permissionsFor: () => granted(...bits) };
}

test('missingOutputPermissions: [] when the bot has View Channel + Send Messages on a text channel', () => {
  const channel = textChannel(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages);
  assert.deepEqual(missingOutputPermissions(channel, BOT), []);
});

test('missingOutputPermissions: reports the missing Send Messages on a text channel', () => {
  const channel = textChannel(PermissionFlagsBits.ViewChannel);
  assert.deepEqual(missingOutputPermissions(channel, BOT), ['Send Messages']);
});

test('missingOutputPermissions: reports the missing Send Messages in Threads on a thread', () => {
  const channel = threadChannel(PermissionFlagsBits.ViewChannel);
  assert.deepEqual(missingOutputPermissions(channel, BOT), ['Send Messages in Threads']);
});

test('missingOutputPermissions: a thread does not require Send Messages', () => {
  // Granted ViewChannel + SendMessagesInThreads, but NOT SendMessages.
  const channel = threadChannel(
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessagesInThreads,
  );
  assert.deepEqual(missingOutputPermissions(channel, BOT), []);
});

test('missingOutputPermissions: reports the missing View Channel on a text channel', () => {
  const channel = textChannel(PermissionFlagsBits.SendMessages);
  assert.deepEqual(missingOutputPermissions(channel, BOT), ['View Channel']);
});

test('missingOutputPermissions: fails closed when me is null or undefined', () => {
  const channel = textChannel(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages);
  assert.deepEqual(missingOutputPermissions(channel, null), ['View Channel', 'Send Messages']);
  assert.deepEqual(missingOutputPermissions(channel, undefined), ['View Channel', 'Send Messages']);
});

test('missingOutputPermissions: fails closed when permissionsFor returns null', () => {
  const channel = { isThread: () => false, permissionsFor: () => null };
  assert.deepEqual(missingOutputPermissions(channel, BOT), ['View Channel', 'Send Messages']);
});

test('missingOutputPermissions: fails closed when the channel has no permissionsFor', () => {
  const channel = { isThread: () => false };
  assert.deepEqual(missingOutputPermissions(channel, BOT), ['View Channel', 'Send Messages']);
});

test('missingOutputPermissions: calls permissionsFor as a method (discord.js channels rely on `this`)', () => {
  const channel = {
    granted: new Set<bigint>([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]),
    isThread: () => false,
    permissionsFor(this: { granted: Set<bigint> }) {
      const { granted: bits } = this;
      return { has: (p: bigint) => bits.has(p) };
    },
  };
  assert.deepEqual(missingOutputPermissions(channel, BOT), []);
});

// --- interruptionNoteCandidateIds ---

test('interruptionNoteCandidateIds: full order', () => {
  const record = { threadId: 'thread-123', outputChannelId: 'output-456' };
  const env = {
    VOICE_TRANSCRIPT_CHANNEL_ID: 'transcript-789',
    GENERAL_CHAT_CHANNEL_ID: 'general-000',
  };
  assert.deepEqual(interruptionNoteCandidateIds(record, env), [
    'thread-123',
    'output-456',
    'transcript-789',
    'general-000',
  ]);
});

test('interruptionNoteCandidateIds: outputChannelId comes before env values', () => {
  const record = { outputChannelId: 'output-456' };
  const env = {
    VOICE_TRANSCRIPT_CHANNEL_ID: 'transcript-789',
    GENERAL_CHAT_CHANNEL_ID: 'general-000',
  };
  assert.deepEqual(interruptionNoteCandidateIds(record, env), [
    'output-456',
    'transcript-789',
    'general-000',
  ]);
});

test('interruptionNoteCandidateIds: blanks dropped', () => {
  const record = { threadId: ' ', outputChannelId: null };
  const env = { VOICE_TRANSCRIPT_CHANNEL_ID: '', GENERAL_CHAT_CHANNEL_ID: 'general-000' };
  assert.deepEqual(interruptionNoteCandidateIds(record, env), ['general-000']);
});

test('interruptionNoteCandidateIds: duplicates removed (keep first)', () => {
  const record = { threadId: 'dup-123', outputChannelId: 'dup-123' };
  const env = { VOICE_TRANSCRIPT_CHANNEL_ID: 'dup-123', GENERAL_CHAT_CHANNEL_ID: 'unique-999' };
  assert.deepEqual(interruptionNoteCandidateIds(record, env), ['dup-123', 'unique-999']);
});

test('interruptionNoteCandidateIds: old records without outputChannelId behave as before', () => {
  const record = { threadId: 'thread-123' };
  const env = {
    VOICE_TRANSCRIPT_CHANNEL_ID: 'transcript-789',
    GENERAL_CHAT_CHANNEL_ID: 'general-000',
  };
  assert.deepEqual(interruptionNoteCandidateIds(record, env), [
    'thread-123',
    'transcript-789',
    'general-000',
  ]);
});
