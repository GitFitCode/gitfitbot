import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectSetupUrl } from '../src/utils/project.ts';
import Project from '../src/commands/Project.ts';

test('builds only the fixed authenticated setup path', () => {
  assert.equal(getProjectSetupUrl('https://hub.example.com'), 'https://hub.example.com/projects/new');
  assert.equal(getProjectSetupUrl('https://hub.example.com/'), 'https://hub.example.com/projects/new');
});

test('rejects missing, non-HTTPS, scoped, and private origins', () => {
  for (const origin of [undefined, '', 'http://hub.example.com', 'https://user:pass@hub.example.com', 'https://hub.example.com/path', 'https://hub.example.com?x=1', 'https://localhost', 'https://10.0.0.1', 'https://[::1]', 'https://[fc00::1]', 'https://[::ffff:10.0.0.1]']) {
    assert.equal(getProjectSetupUrl(origin), undefined, origin);
  }
});

test('handler acknowledges ephemerally then edits the final link', async () => {
  const calls: unknown[] = [];
  const interaction = {
    reply: async (payload: unknown) => { calls.push(payload); },
    editReply: async (payload: unknown) => { calls.push(payload); },
  } as any;
  process.env.HUB_PUBLIC_ORIGIN = 'https://hub.example.com';
  await Project.run({} as any, interaction);
  assert.deepEqual(calls, [
    { ephemeral: true, content: 'Opening authenticated project setup…', fetchReply: true },
    'Open authenticated project setup: https://hub.example.com/projects/new',
  ]);
  delete process.env.HUB_PUBLIC_ORIGIN;
});

test('handler gives truthful ephemeral unconfigured response without editing', async () => {
  const calls: unknown[] = [];
  const interaction = {
    reply: async (payload: unknown) => { calls.push(payload); },
    editReply: async (payload: unknown) => { calls.push(payload); },
  } as any;
  await Project.run({} as any, interaction);
  assert.deepEqual(calls, [{ ephemeral: true, content: 'Project setup is temporarily unavailable: the hub public origin is not configured.', fetchReply: true }]);
});
