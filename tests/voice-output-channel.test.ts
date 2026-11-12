import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOutputChannelId } from '../src/utils/voiceOutputChannel';

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
