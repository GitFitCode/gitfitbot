import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectSetupUrl } from '../src/utils/project.ts';

test('builds only the fixed authenticated setup path', () => {
  assert.equal(getProjectSetupUrl('https://hub.example.com'), 'https://hub.example.com/projects/new');
  assert.equal(getProjectSetupUrl('https://hub.example.com/'), 'https://hub.example.com/projects/new');
});

test('rejects missing, non-HTTPS, scoped, and private origins', () => {
  for (const origin of [undefined, '', 'http://hub.example.com', 'https://user:pass@hub.example.com', 'https://hub.example.com/path', 'https://hub.example.com?x=1', 'https://localhost', 'https://10.0.0.1']) {
    assert.equal(getProjectSetupUrl(origin), undefined, origin);
  }
});
