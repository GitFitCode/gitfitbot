import assert from 'node:assert/strict';
import test from 'node:test';
import { DiscordReadAdapter } from '../src/threadRead/discordAdapter';
import { hasHistoryPermissions } from '../src/threadRead/permissions';
import {
  ReadFailure,
  ThreadReadService,
  type Grant,
  type MessageEvidence,
  type ReadPort,
} from '../src/threadRead/service';
const guildId = '328054349420822530';
const forumId = '1032761290919260262';
const threadId = '1400000000000000000';
const now = '2026-10-08T12:00:00.000Z';
const scope = { guildId, forumId };
const grant: Grant = { ...scope, threads: { kind: 'all' } };
const thread = (id = threadId, archived = false) => ({
  id,
  guildId,
  parentId: forumId,
  type: 11,
  ownerId: '1400000000000000099',
  name: 'Build log',
  archived,
  locked: false,
  archiveTimestamp: '2026-10-08T10:00:00.000Z',
});
const message = (id: string, createdAt = '2026-10-08T10:00:00.123456Z'): MessageEvidence => ({
  id,
  threadId,
  authorId: '1400000000000000099',
  authorDisplayName: 'Ada',
  createdAt,
  editedAt: '2026-10-08T11:00:00.654321Z',
  content: 'Evidence',
  url: `https://discord.com/channels/${guildId}/${threadId}/${id}`,
  attachments: [
    {
      id: '1400000000000000088',
      name: 'notes.txt',
      url: 'https://cdn.discordapp.com/notes.txt',
      size: 12,
      contentType: 'text/plain',
    },
  ],
});
const history = {
  kind: 'history',
  scope,
  threadId,
  since: '2026-10-08T00:00:00.000Z',
  until: now,
  maxPages: 2,
  maxMessages: 100,
};
function fixture() {
  const calls: string[] = [];
  let grants: readonly Grant[] = [grant];
  const port: ReadPort = {
    fetchForum: async () => ({ id: forumId, guildId, type: 15, flags: 0, availableTags: [] }),
    fetchThread: async (id) => {
      calls.push(`thread:${id}`);
      return thread(id);
    },
    listActiveThreads: async () => {
      calls.push('active');
      return [thread()];
    },
    listArchivedPage: async () => {
      calls.push('archived');
      return { threads: [], hasMore: false };
    },
    fetchMessages: async (_id, before, limit) => {
      calls.push(`messages:${before}:${limit}`);
      return [];
    },
  };
  const service = new ThreadReadService(
    port,
    () => grants,
    () => Date.parse(now),
  );
  return {
    service,
    port,
    calls,
    revoke: () => {
      grants = [];
    },
  };
}
const lookup = { kind: 'lookup', scope, query: { kind: 'name', text: 'build' }, maxPages: 5 };
test('exact ID validates configured scope and observed parent before returning a thread', async () => {
  const f = fixture();
  const exact = { ...lookup, query: { kind: 'id', id: threadId } };
  assert.equal((await f.service.read('alice', exact)).status, 'complete');
  f.port.fetchThread = async () => ({ ...thread(), parentId: '1400000000000000001' });
  assert.equal((await f.service.read('alice', exact)).status, 'denied');
  const denied = await f.service.read('alice', {
    ...exact,
    scope: { ...scope, guildId: '1400000000000000002' },
  });
  assert.equal(denied.status, 'denied');
  assert.deepEqual(denied.threads, []);
});
test('name lookup returns active and archived ambiguous matches without selecting one', async () => {
  const f = fixture();
  f.port.listArchivedPage = async () => ({
    threads: [thread('1400000000000000001', true)],
    hasMore: false,
  });
  const result = await f.service.read('alice', lookup);
  assert.equal(result.status, 'complete');
  assert.equal(result.resolution, 'ambiguous');
  assert.equal(result.threads.length, 2);
  assert.equal(result.threads[1].archived, true);
  assert.equal(f.calls.filter((c) => c === 'active').length, 2);
});
test('history retains exact provenance through JSON and two assistant clients', async () => {
  const f = fixture();
  const evidence = message('1400000000000000003');
  f.port.fetchMessages = async () => [evidence];
  // A tool-calling chat client preserves the whole JSON tool result.
  const chatClient = async (toolArguments: string) => ({
    toolResult: JSON.stringify(await f.service.read('alice', JSON.parse(toolArguments))),
  });
  // A source-reconciliation client consumes the same response as typed evidence rows.
  const reconciliationClient = async () => {
    const response = await f.service.read('alice', history);
    return {
      response,
      references: response.messages.map((m) => ({ id: m.id, author: m.authorId, source: m.url })),
    };
  };
  const chat = await chatClient(JSON.stringify(history));
  const reconciliation = await reconciliationClient();
  const a = JSON.parse(chat.toolResult);
  assert.deepEqual(a.messages, [evidence]);
  assert.deepEqual(reconciliation.response, a);
  assert.deepEqual(reconciliation.references, [
    { id: evidence.id, author: evidence.authorId, source: evidence.url },
  ]);
  assert.equal(a.coverage.intervalExhausted, true);
});
test('history deduplicates and sorts chronologically across bounded pages', async () => {
  const f = fixture();
  let n = 0;
  f.port.fetchMessages = async (_id, _before, limit) => {
    n++;
    if (n === 1)
      return Array.from({ length: limit }, (_, i) =>
        message(String(1400000000000000200n - BigInt(i))),
      );
    return [
      message('1400000000000000101'),
      message('1400000000000000001', '2026-10-08T09:00:00.000Z'),
    ];
  };
  const result = await f.service.read('alice', { ...history, maxMessages: 200 });
  assert.equal(result.status, 'complete');
  assert.equal(result.messages.length, 101);
  assert.equal(result.messages[0].id, '1400000000000000001');
  assert.equal(result.coverage.pagesRead, 2);
});
test('continuation is stable, bound to caller and bounds, and rechecks revoked grants', async () => {
  const f = fixture();
  f.port.fetchMessages = async (_id, before, limit) =>
    before === '1400000000000000101'
      ? []
      : Array.from({ length: limit }, (_, i) => message(String(1400000000000000200n - BigInt(i))));
  const first = await f.service.read('alice', history);
  assert.equal(first.status, 'partial');
  assert.equal(first.coverage.reason, 'message_limit');
  assert.ok(first.coverage.nextCursor);
  const next = { ...history, cursor: first.coverage.nextCursor };
  assert.equal((await f.service.read('alice', next)).status, 'complete');
  assert.deepEqual(await f.service.read('alice', next), await f.service.read('alice', next));
  assert.equal((await f.service.read('bob', next)).status, 'denied');
  assert.equal(
    (await f.service.read('alice', { ...next, since: '2026-10-07T00:00:00.000Z' })).status,
    'denied',
  );
  assert.equal(
    (await f.service.read('alice', { ...next, cursor: `${first.coverage.nextCursor}x` })).status,
    'denied',
  );
  f.revoke();
  assert.equal((await f.service.read('alice', next)).status, 'denied');
});
test('complete empty, unavailable, denied, rate limited, failed and partial are distinct', async () => {
  const f = fixture();
  assert.equal((await f.service.read('alice', history)).status, 'complete');
  for (const status of ['unavailable', 'denied', 'rate_limited', 'failed'] as const) {
    f.port.fetchMessages = async () => {
      throw new ReadFailure(status, 1000);
    };
    const result = await f.service.read('alice', history);
    assert.equal(result.status, status);
    assert.equal(result.coverage.intervalExhausted, false);
    assert.deepEqual(result.messages, []);
  }
  let n = 0;
  f.port.fetchMessages = async (_id, _before, limit) => {
    if (n++) throw new ReadFailure('rate_limited', 1000);
    return Array.from({ length: limit }, (_, i) =>
      message(String(1400000000000000200n - BigInt(i))),
    );
  };
  const partial = await f.service.read('alice', { ...history, maxMessages: 200 });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.coverage.reason, 'rate_limited');
  assert.equal(partial.retryAfterMs, 1000);
});
test('archive page cap continues with boundary overlap and never treats a failed scan as absence', async () => {
  const f = fixture();
  f.port.listActiveThreads = async () => [];
  const archived = thread(threadId, true);
  f.port.listArchivedPage = async (_id, before) => ({
    threads: [archived],
    hasMore: before === null,
  });
  const request = { ...lookup, maxPages: 2 };
  const first = await f.service.read('alice', request);
  assert.equal(first.status, 'partial');
  assert.equal(first.resolution, 'incomplete');
  const last = await f.service.read('alice', { ...request, cursor: first.coverage.nextCursor });
  assert.equal(last.status, 'complete');
  assert.equal(last.threads.length, 1);
  f.port.listArchivedPage = async () => {
    throw new ReadFailure('failed');
  };
  const failed = await f.service.read('alice', lookup);
  assert.equal(failed.status, 'partial');
  assert.equal(failed.resolution, 'incomplete');
});
test('invalid requests and excessive limits do no collection; thread allowlist fails closed', async () => {
  const f = fixture();
  assert.equal(
    (await f.service.read('alice', { ...history, maxPages: 10000 })).status,
    'invalid_request',
  );
  assert.equal(
    (await f.service.read('alice', { ...history, token: 'secret' })).status,
    'invalid_request',
  );
  assert.deepEqual(f.calls, []);
  const restricted = new ThreadReadService(f.port, () => [
    { ...grant, threads: { kind: 'ids', ids: ['1400000000000000009'] } },
  ]);
  assert.equal((await restricted.read('alice', history)).status, 'denied');
  assert.equal((await restricted.read('alice', lookup)).threads.length, 0);
});
test('raw Discord adapter preserves microsecond timestamps, nicknames and attachment metadata', async () => {
  const f = fixture();
  const raw = {
    id: '1400000000000000003',
    channel_id: threadId,
    author: { id: '1400000000000000099', username: 'ada', global_name: 'Ada' },
    member: { nick: 'Ada Lovelace' },
    timestamp: '2026-10-08T10:00:00.123456+00:00',
    edited_timestamp: '2026-10-08T11:00:00.654321+00:00',
    content: 'Exact content\nwith line break',
    attachments: [
      {
        id: '1400000000000000088',
        filename: 'notes.txt',
        url: 'https://cdn.discordapp.com/notes.txt',
        size: 12,
        content_type: 'text/plain',
      },
    ],
  };
  const calls: string[] = [];
  const adapter = new DiscordReadAdapter(f.port, {
    assertReadable: async () => {
      calls.push('permission');
    },
    getMessages: async (_id, before, limit) => {
      assert.ok(before);
      assert.equal(limit, 100);
      return [raw];
    },
  });
  const service = new ThreadReadService(
    adapter,
    () => [grant],
    () => Date.parse(now),
  );
  const response = JSON.parse(JSON.stringify(await service.read('alice', history)));
  assert.equal(response.status, 'complete');
  assert.deepEqual(response.messages[0], {
    ...message(raw.id),
    authorDisplayName: 'Ada Lovelace',
    createdAt: raw.timestamp,
    editedAt: raw.edited_timestamp,
    content: raw.content,
  });
  assert.deepEqual(calls, ['permission']);
});
test('permission loss cannot turn an empty Discord response into complete empty evidence', async () => {
  const f = fixture();
  let checks = 0;
  const adapter = new DiscordReadAdapter(f.port, {
    assertReadable: async () => {
      if (++checks === 2) throw new ReadFailure('unavailable');
    },
    getMessages: async () => [],
  });
  const service = new ThreadReadService(
    adapter,
    () => [grant],
    () => Date.parse(now),
  );
  const response = await service.read('alice', history);
  assert.equal(response.status, 'unavailable');
  assert.equal(response.coverage.intervalExhausted, false);
});
test('malformed or cross-thread payloads fail closed without disclosing unrelated content', async () => {
  const f = fixture();
  const adapter = new DiscordReadAdapter(f.port, {
    assertReadable: async () => {},
    getMessages: async () => [{ id: threadId, content: 'secret' }],
  });
  const service = new ThreadReadService(
    adapter,
    () => [grant],
    () => Date.parse(now),
  );
  const response = await service.read('alice', history);
  assert.equal(response.status, 'failed');
  assert.equal(JSON.stringify(response).includes('secret'), false);
});
test('archive ties that cannot advance and missing has_more are partial, never empty', async () => {
  for (const hasMore of [true, undefined]) {
    const f = fixture();
    f.port.listActiveThreads = async () => [];
    f.port.listArchivedPage = async () => ({ threads: [thread(threadId, true)], hasMore });
    const response = await f.service.read('alice', lookup);
    assert.equal(response.status, 'partial');
    assert.equal(response.coverage.intervalExhausted, false);
    assert.equal(response.coverage.nextCursor, null);
  }
});
test('history respects the interval, page ceiling and detects a stalled upstream cursor', async () => {
  const f = fixture();
  f.port.fetchMessages = async (_id, _before, limit) =>
    Array.from({ length: limit }, (_, i) => message(String(1400000000000000200n - BigInt(i))));
  const bounded = await f.service.read('alice', { ...history, maxPages: 1, maxMessages: 200 });
  assert.equal(bounded.coverage.reason, 'page_limit');
  const stalled = await f.service.read('alice', { ...history, maxMessages: 200 });
  assert.equal(stalled.coverage.reason, 'stalled_cursor');
  f.port.fetchMessages = async () => [
    message('1400000000000000002', history.since),
    message('1400000000000000001', '2026-10-07T23:59:59.999Z'),
  ];
  const interval = await f.service.read('alice', history);
  assert.equal(interval.status, 'complete');
  assert.deepEqual(
    interval.messages.map((m) => m.id),
    ['1400000000000000002'],
  );
});
test('expired continuation requires a fresh bounded request', async () => {
  const f = fixture();
  let clock = Date.parse(now);
  const service = new ThreadReadService(
    f.port,
    () => [grant],
    () => clock,
  );
  f.port.fetchMessages = async () => [message('1400000000000000001')];
  const request = { ...history, maxMessages: 1 };
  const first = await service.read('alice', request);
  clock += 16 * 60 * 1000;
  assert.equal(
    (await service.read('alice', { ...request, cursor: first.coverage.nextCursor })).status,
    'denied',
  );
});
test('forum mismatch blocks history before message collection and continuation rechecks the thread', async () => {
  const f = fixture();
  f.port.fetchForum = async () => ({
    id: forumId,
    guildId: '1400000000000000002',
    type: 15,
    flags: 0,
    availableTags: [],
  });
  assert.equal((await f.service.read('alice', history)).status, 'denied');
  assert.deepEqual(f.calls, []);
  const g = fixture();
  g.port.fetchMessages = async () => [message('1400000000000000001')];
  const request = { ...history, maxMessages: 1 };
  const first = await g.service.read('alice', request);
  g.port.fetchThread = async () => ({ ...thread(), guildId: '1400000000000000002' });
  assert.equal(
    (await g.service.read('alice', { ...request, cursor: first.coverage.nextCursor })).status,
    'denied',
  );
});
test('archive boundary disappearance cannot prove completeness', async () => {
  const f = fixture();
  f.port.listActiveThreads = async () => [];
  let n = 0;
  f.port.listArchivedPage = async () =>
    n++ === 0
      ? { threads: [thread(threadId, true)], hasMore: true }
      : { threads: [], hasMore: false };
  const response = await f.service.read('alice', lookup);
  assert.equal(response.status, 'partial');
  assert.equal(response.coverage.reason, 'archive_incomplete');
});
test('fresh permission snapshots apply everyone, role and member overwrites in Discord order', () => {
  const botId = '1400000000000000099';
  const roleId = '1400000000000000088';
  const flags = { Administrator: 8n, ViewChannel: 1024n, ReadMessageHistory: 65536n };
  const input = {
    guildId,
    botId,
    flags,
    roles: [{ id: guildId, permissions: '66560' }],
    member: { roles: [roleId] },
    forum: {
      permission_overwrites: [] as {
        id: string;
        type: number;
        allow: string;
        deny: string;
      }[],
    },
  };
  assert.equal(hasHistoryPermissions(input), true);
  input.forum.permission_overwrites.push({ id: guildId, type: 0, allow: '0', deny: '65536' });
  assert.equal(hasHistoryPermissions(input), false);
  input.forum.permission_overwrites.push({ id: roleId, type: 0, allow: '65536', deny: '0' });
  assert.equal(hasHistoryPermissions(input), true);
  input.forum.permission_overwrites.push({ id: botId, type: 1, allow: '0', deny: '65536' });
  assert.equal(hasHistoryPermissions(input), false);
  input.roles.push({ id: roleId, permissions: '8' });
  assert.equal(hasHistoryPermissions(input), true);
  assert.throws(() => hasHistoryPermissions({ ...input, forum: {} }), ReadFailure);
});
test('a final active rescan that reaches the match cap remains partial', async () => {
  const f = fixture();
  let scans = 0;
  f.port.listActiveThreads = async () =>
    ++scans === 1
      ? []
      : Array.from({ length: 101 }, (_, i) => thread(String(1400000000000000000n + BigInt(i))));
  const response = await f.service.read('alice', lookup);
  assert.equal(response.status, 'partial');
  assert.equal(response.coverage.reason, 'match_limit');
  assert.equal(response.threads.length, 100);
  assert.equal(response.coverage.nextCursor, null);
});
test('lookup continuation cannot change query or forum, or reveal revoked matches', async () => {
  const f = fixture();
  const request = { ...lookup, maxPages: 1 };
  const first = await f.service.read('alice', request);
  assert.ok(first.coverage.nextCursor);
  const next = { ...request, cursor: first.coverage.nextCursor };
  assert.equal(
    (await f.service.read('alice', { ...next, query: { kind: 'name', text: 'other' } })).status,
    'denied',
  );
  assert.equal(
    (
      await f.service.read('alice', {
        ...next,
        scope: { ...scope, forumId: '1400000000000000099' },
      })
    ).status,
    'denied',
  );
  f.revoke();
  const denied = await f.service.read('alice', next);
  assert.equal(denied.status, 'denied');
  assert.deepEqual(denied.threads, []);
});

test('encrypted continuation does not disclose archive IDs excluded by a thread allowlist', async () => {
  const f = fixture();
  f.port.listActiveThreads = async () => [];
  f.port.listArchivedPage = async () => ({ threads: [thread(threadId, true)], hasMore: true });
  const service = new ThreadReadService(
    f.port,
    () => [{ ...grant, threads: { kind: 'ids', ids: ['1400000000000000009'] } }],
    () => Date.parse(now),
  );
  const response = await service.read('alice', { ...lookup, maxPages: 2 });
  assert.equal(response.status, 'partial');
  assert.deepEqual(response.threads, []);
  assert.ok(response.coverage.nextCursor);
  for (const part of response.coverage.nextCursor.split('.')) {
    assert.equal(Buffer.from(part, 'base64url').includes(Buffer.from(threadId)), false);
  }
});

test('a widened caller grant cannot expand an existing lookup continuation', async () => {
  const f = fixture();
  const secondId = '1400000000000000001';
  let ids = [threadId];
  const service = new ThreadReadService(
    f.port,
    () => [{ ...grant, threads: { kind: 'ids', ids } }],
    () => Date.parse(now),
  );
  const request = { ...lookup, maxPages: 1 };
  const first = await service.read('alice', request);
  assert.ok(first.coverage.nextCursor);
  ids = [threadId, secondId];
  f.port.listArchivedPage = async () => ({ threads: [thread(secondId, true)], hasMore: false });
  const countBefore = f.calls.length;
  const response = await service.read('alice', { ...request, cursor: first.coverage.nextCursor });
  assert.equal(response.status, 'denied');
  assert.deepEqual(response.threads, []);
  assert.equal(f.calls.length, countBefore);
});
