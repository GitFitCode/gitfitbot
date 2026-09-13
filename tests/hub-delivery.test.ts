import { Client } from 'discord.js';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { startProjectDeliveryWorker, stopProjectDeliveryWorker } from '../src/hubDelivery';
import { parseTagConfig, readDeliveryConfig } from '../src/hubDelivery/config';
import {
  checkpointRequestSchema,
  checkpointResponseSchema,
  claimSchema,
  computeSnapshotSha256,
  resultRequestSchema,
  resultResponseSchema,
} from '../src/hubDelivery/contract';
import {
  buildCreateThreadBody,
  createSingleShotRest,
  DiscordForumPort,
  ForumPortError,
  type CreateThreadBody,
} from '../src/hubDelivery/forumPort';
import { HubClient } from '../src/hubDelivery/hubClient';
import { ProjectDeliveryWorker, type CycleResult } from '../src/hubDelivery/worker';
import { GFC_GUILD_ID, GFC_PROJECTS_FORUM_ID } from '../src/utils/constants';
import {
  apiError,
  BOT_USER_ID,
  failure,
  FakeForumPort,
  FakeHub,
  LEASE_EXPIRES_AT,
  NOW,
  OTHER_USER_ID,
  OWNER_ID,
  TAG_MISSING,
  TAG_MODERATED,
  TAG_OPEN,
  TOKEN,
} from './support/hubDeliveryFakes';

// Any accidental real HTTP call fails the suite: every client under test gets an injected fetch.
globalThis.fetch = (async () => {
  throw new Error('network access is forbidden in hub-delivery tests');
}) as typeof fetch;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const fixtureDir = path.join(__dirname, 'fixtures', 'discord-delivery.v1');
function fixture(name: string): Json {
  return JSON.parse(readFileSync(path.join(fixtureDir, name), 'utf8')) as Json;
}
const createClaim = (overrides: Json = {}): Json => ({
  ...fixture('claim-create.json'),
  ...overrides,
});
const reconcileClaim = (overrides: Json = {}): Json => ({
  ...fixture('claim-reconcile.json'),
  ...overrides,
});
const connectClaim = (overrides: Json = {}): Json => ({
  ...fixture('claim-connect-existing.json'),
  ...overrides,
});
const MARKER = `Hub reference: ${fixture('claim-create.json').deliveryRef}`;
const CONTENT = fixture('claim-create.json').post.content as string;

function withPost(claim: Json, post: Json): Json {
  return { ...claim, post, snapshotSha256: computeSnapshotSha256(post as never) };
}

interface Harness {
  forum: FakeForumPort;
  hub: FakeHub;
  hubClient: HubClient;
  worker: ProjectDeliveryWorker;
  logs: string[];
  sleeps: number[];
  events: string[];
}

function harness(
  options: { tags?: string; forum?: FakeForumPort; hub?: FakeHub; events?: string[] } = {},
): Harness {
  const events = options.events ?? [];
  const forum = options.forum ?? new FakeForumPort({ events });
  const hub = options.hub ?? new FakeHub({ events });
  const logs: string[] = [];
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  const hubClient = new HubClient({
    origin: 'https://hub.example.test',
    token: TOKEN,
    fetch: hub.fetch,
    sleep,
    now: () => NOW,
    random: () => 0.5,
  });
  const worker = new ProjectDeliveryWorker({
    hub: hubClient,
    forum,
    botUserId: BOT_USER_ID,
    tags: parseTagConfig(options.tags ?? ''),
    now: () => NOW,
    sleep,
    random: () => 0.5,
    log: (line) => logs.push(line),
  });
  return { forum, hub, hubClient, worker, logs, sleeps, events };
}

async function deliver(h: Harness, claim: Json): Promise<CycleResult> {
  h.hub.claims.push({ status: 200, body: claim });
  return h.worker.runOnce();
}

function assertResult(h: Harness, expected: Json): Json {
  const result = h.hub.lastResult();
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(result[key], value, key);
  assert.equal(
    resultRequestSchema.safeParse(result).success,
    true,
    'posted result is contract-valid',
  );
  return result;
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

test('contract fixtures parse strictly and the snapshot hash binds the rendered post', () => {
  const names = readdirSync(fixtureDir).sort();
  assert.ok(names.length >= 10);
  for (const name of names) {
    const value = fixture(name);
    const schema = name.startsWith('claim-')
      ? claimSchema
      : name === 'checkpoint-request.json'
        ? checkpointRequestSchema
        : name === 'checkpoint-response.json'
          ? checkpointResponseSchema
          : name === 'result-response.json'
            ? resultResponseSchema
            : resultRequestSchema;
    assert.equal(schema.safeParse(value).success, true, name);
  }
  const create = fixture('claim-create.json');
  assert.equal(computeSnapshotSha256(create.post), create.snapshotSha256);
  assert.equal(
    computeSnapshotSha256({ content: create.post.content, threadName: create.post.threadName }),
    create.snapshotSha256,
    'key order does not change the canonical hash',
  );
});

test('contract rejects unknown fields, bad identifiers, and mismatched operation shapes', () => {
  const invalidClaims: Json[] = [
    createClaim({ extra: true }),
    createClaim({ contract: 'gfc.discord-delivery.v2' }),
    createClaim({ deliveryRef: 'gfcp-NOT-VALID' }),
    createClaim({ deliveryId: 'project:123' }),
    createClaim({ target: { guildId: '32805434942082253x', forumId: GFC_PROJECTS_FORUM_ID } }),
    createClaim({ target: { ...createClaim().target, tagIds: [TAG_OPEN] } }),
    createClaim({ post: { ...createClaim().post, embeds: [] } }),
    createClaim({ requestedThreadId: '1300000000000000000' }),
    createClaim({ snapshotSha256: 'ABC' }),
    createClaim({ attempt: 0 }),
    reconcileClaim({ createWindow: null }),
    connectClaim({ post: createClaim().post }),
    connectClaim({ owner: { discordUserId: 'someone' } }),
    { ...createClaim(), leaseToken: undefined },
  ];
  for (const claim of invalidClaims)
    assert.equal(claimSchema.safeParse(claim).success, false, JSON.stringify(claim).slice(0, 120));
  assert.equal(
    checkpointResponseSchema.safeParse({ leaseExpiresAt: '2026-09-12T23:05:00.000Z', x: 1 })
      .success,
    false,
  );
  assert.equal(
    resultRequestSchema.safeParse({
      ...fixture('result-linked-created.json'),
      resolution: undefined,
    }).success,
    false,
    'linked requires a resolution',
  );
  assert.equal(
    resultRequestSchema.safeParse({ ...fixture('result-absent.json'), code: 'Bad-Code' }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// Configuration and lifecycle
// ---------------------------------------------------------------------------

test('delivery is disabled unless the flag is exactly true with a safe origin and token', () => {
  const valid = {
    GFC_PROJECT_DELIVERY_ENABLED: 'true',
    GFC_PROJECT_HUB_ORIGIN: 'https://hub.example.test',
    GFC_HUB_DELIVERY_TOKEN: TOKEN,
  };
  assert.deepEqual(readDeliveryConfig({}), { enabled: false, reason: 'disabled' });
  for (const flag of ['TRUE', '1', 'yes', ''])
    assert.deepEqual(readDeliveryConfig({ ...valid, GFC_PROJECT_DELIVERY_ENABLED: flag }), {
      enabled: false,
      reason: 'disabled',
    });
  for (const origin of [undefined, 'http://hub.example.test', 'https://hub.example.test/api'])
    assert.deepEqual(readDeliveryConfig({ ...valid, GFC_PROJECT_HUB_ORIGIN: origin }), {
      enabled: false,
      reason: 'invalid_origin',
    });
  for (const token of [undefined, 'short', `${TOKEN} `, 'x'.repeat(600)])
    assert.deepEqual(readDeliveryConfig({ ...valid, GFC_HUB_DELIVERY_TOKEN: token }), {
      enabled: false,
      reason: 'invalid_token',
    });
  const enabled = readDeliveryConfig(valid);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.enabled && enabled.origin, 'https://hub.example.test');
  assert.equal(
    readDeliveryConfig({ ...valid, GFC_PROJECT_HUB_ORIGIN: 'http://127.0.0.1:8080/' }).enabled,
    true,
  );
});

test('tag configuration accepts only up to five unique snowflakes', () => {
  assert.deepEqual(parseTagConfig(undefined), { ok: true, ids: [] });
  assert.deepEqual(parseTagConfig(` ${TAG_OPEN} `), { ok: true, ids: [TAG_OPEN] });
  for (const raw of [
    'nope',
    `${TAG_OPEN},${TAG_OPEN}`,
    `${TAG_OPEN},`,
    Array(6)
      .fill(0)
      .map((_, i) => `44444444444444444${i}`)
      .join(','),
  ])
    assert.deepEqual(parseTagConfig(raw), { ok: false }, raw);
});

test('disabled worker never starts and never calls the Hub', async () => {
  let calls = 0;
  const countingFetch = (async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const client = { user: { id: BOT_USER_ID }, rest: {}, token: 'x' } as unknown as Client;
  for (const env of [
    {},
    { GFC_PROJECT_DELIVERY_ENABLED: 'true', GFC_HUB_DELIVERY_TOKEN: TOKEN },
    { GFC_PROJECT_DELIVERY_ENABLED: 'true', GFC_PROJECT_HUB_ORIGIN: 'https://hub.example.test' },
  ]) {
    assert.equal(
      startProjectDeliveryWorker(client, { env, fetch: countingFetch, log: () => undefined }),
      null,
    );
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('enabled worker is single-instance and stops cleanly with the bot lifecycle', async () => {
  let calls = 0;
  const countingFetch = (async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const client = { user: { id: BOT_USER_ID }, rest: {}, token: 'x' } as unknown as Client;
  const env = {
    GFC_PROJECT_DELIVERY_ENABLED: 'true',
    GFC_PROJECT_HUB_ORIGIN: 'https://hub.example.test',
    GFC_HUB_DELIVERY_TOKEN: TOKEN,
  };
  const first = startProjectDeliveryWorker(client, {
    env,
    fetch: countingFetch,
    log: () => undefined,
  });
  const second = startProjectDeliveryWorker(client, {
    env,
    fetch: countingFetch,
    log: () => undefined,
  });
  assert.ok(first);
  assert.equal(second, first);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await stopProjectDeliveryWorker();
  const afterStop = calls;
  assert.equal(afterStop, 1, 'one claim, then an idle sleep that stop interrupts');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, afterStop);
});

test('worker runs are single-flight and back off on Hub auth/unavailable responses without Discord calls', async () => {
  const h = harness();
  h.hub.claims.push({ status: 401 }, { status: 404 }, { networkError: true }, { status: 503 });
  const [a, b] = await Promise.all([h.worker.runOnce(), h.worker.runOnce()]);
  assert.equal(a.kind, 'unavailable');
  assert.equal(b.kind, 'busy');
  assert.equal((await h.worker.runOnce()).kind, 'unavailable');
  assert.equal((await h.worker.runOnce()).kind, 'unavailable');
  assert.equal((await h.worker.runOnce()).kind, 'unavailable');
  assert.equal(h.forum.calls.length, 0);
  assert.equal(h.hub.requestsTo('result').length, 0);

  const loop = harness();
  loop.hub.claims.push({ status: 401 }, { status: 401 }, { status: 401 }, { status: 204 });
  const delays: number[] = [];
  let reachedFourthSleep: () => void = () => undefined;
  const fourthSleep = new Promise<void>((resolve) => {
    reachedFourthSleep = resolve;
  });
  const looping = new ProjectDeliveryWorker({
    hub: loop.hubClient,
    forum: loop.forum,
    botUserId: BOT_USER_ID,
    tags: parseTagConfig(''),
    now: () => NOW,
    random: () => 0.5,
    log: () => undefined,
    sleep: async (ms) => {
      delays.push(ms);
      if (delays.length === 4) reachedFourthSleep();
    },
  });
  looping.start();
  await fourthSleep;
  await looping.stop();
  assert.deepEqual(delays.slice(0, 4), [30_000, 60_000, 120_000, 15_000]);
  assert.equal(loop.forum.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Hub client
// ---------------------------------------------------------------------------

test('Hub client sends fenced, bearer-authenticated, non-redirecting requests and never logs secrets', async () => {
  const h = harness();
  await deliver(h, createClaim());
  const [claim] = h.hub.requestsTo('claim');
  assert.equal(claim.url, 'https://hub.example.test/api/service/discord-delivery/v1/claim');
  assert.equal(claim.method, 'POST');
  assert.equal(claim.redirect, 'error');
  assert.equal(claim.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(claim.headers['x-gfc-contract'], 'gfc.discord-delivery.v1');
  assert.equal(claim.rawBody, '{}');
  const [checkpoint] = h.hub.requestsTo('checkpoint');
  assert.equal(
    checkpoint.url,
    `https://hub.example.test/api/service/discord-delivery/v1/deliveries/${createClaim().deliveryId}/checkpoint`,
  );
  assert.deepEqual(checkpoint.body, fixture('checkpoint-request.json'));
  for (const request of h.hub.requests) assert.equal(request.redirect, 'error');
  const logText = h.logs.join('\n');
  assert.equal(logText.includes(TOKEN), false);
  assert.equal(logText.includes(createClaim().leaseToken), false);
  assert.equal(logText.includes('synthetic project introduction'), false);
});

test('strictly invalid or oversize claims cause zero Discord calls and no result', async () => {
  for (const scripted of [
    { status: 200, body: createClaim({ unexpected: 'field' }) },
    { status: 200, rawBody: 'not json' },
    { status: 200, body: { ...createClaim(), padding: 'x'.repeat(17 * 1024) } },
  ]) {
    const h = harness();
    h.hub.claims.push(scripted);
    assert.equal((await h.worker.runOnce()).kind, 'invalid_claim');
    assert.equal(h.forum.calls.length, 0);
    assert.equal(h.hub.requestsTo('result').length, 0);
  }
});

// ---------------------------------------------------------------------------
// Target pinning and pre-flight
// ---------------------------------------------------------------------------

test('target mismatch is terminal with zero ForumPort calls for every operation', async () => {
  for (const claim of [createClaim(), reconcileClaim(), connectClaim()])
    for (const target of [
      { guildId: '111111111111111111', forumId: GFC_PROJECTS_FORUM_ID },
      { guildId: GFC_GUILD_ID, forumId: '222222222222222222' },
    ]) {
      const h = harness();
      await deliver(h, { ...claim, target });
      assert.equal(h.forum.calls.length, 0, claim.operation);
      assert.equal(h.hub.requestsTo('checkpoint').length, 0);
      assertResult(h, { outcome: 'terminal', code: 'target_mismatch', createAttempted: false });
    }
});

test('snapshot and content problems are terminal before any Discord call', async () => {
  const cases: [Json, string][] = [
    [createClaim({ snapshotSha256: 'a'.repeat(64) }), 'snapshot_mismatch'],
    [reconcileClaim({ snapshotSha256: 'a'.repeat(64) }), 'snapshot_mismatch'],
    [
      withPost(createClaim(), { threadName: 'No marker', content: 'no marker here' }),
      'content_invalid',
    ],
    [
      withPost(createClaim(), { threadName: 'Twice', content: `${MARKER}\n${MARKER}` }),
      'content_invalid',
    ],
    [withPost(createClaim(), { threadName: 'x'.repeat(101), content: MARKER }), 'content_invalid'],
    [withPost(createClaim(), { threadName: 'line\nbreak', content: MARKER }), 'content_invalid'],
    [withPost(createClaim(), { threadName: ' padded ', content: MARKER }), 'content_invalid'],
    [
      withPost(createClaim(), { threadName: 'Long', content: `${'x'.repeat(1990)}\n${MARKER}` }),
      'content_invalid',
    ],
  ];
  for (const [claim, code] of cases) {
    const h = harness();
    await deliver(h, claim);
    assert.equal(h.forum.calls.length, 0, code);
    assertResult(h, { outcome: 'terminal', code, createAttempted: false });
  }
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

test('create checkpoints first, sends safe options and exact content once, and links the thread', async () => {
  const h = harness({ tags: TAG_OPEN });
  const result = await deliver(h, createClaim());
  assert.equal(result.kind, 'reported');
  assert.deepEqual(
    h.events.filter((event) => event === 'hub:checkpoint' || event === 'forum:createThread'),
    ['hub:checkpoint', 'forum:createThread'],
  );
  const [[forumId, body]] = h.forum.callsTo('createThread') as [string, CreateThreadBody][];
  assert.equal(forumId, GFC_PROJECTS_FORUM_ID);
  assert.deepEqual(body, {
    name: 'Synthetic Hub Project',
    applied_tags: [TAG_OPEN],
    message: { content: CONTENT, allowed_mentions: { parse: [] }, flags: 4 },
  });
  assert.deepEqual(buildCreateThreadBody(createClaim().post, [TAG_OPEN]), body);
  const threadId = [...h.forum.threads.keys()][0];
  assertResult(h, {
    outcome: 'linked',
    code: 'created',
    resolution: 'created',
    createAttempted: true,
    snapshotSha256: createClaim().snapshotSha256,
    discord: {
      guildId: GFC_GUILD_ID,
      forumId: GFC_PROJECTS_FORUM_ID,
      threadId,
      starterMessageId: threadId,
      threadOwnerId: BOT_USER_ID,
      archived: false,
      locked: false,
      name: 'Synthetic Hub Project',
    },
  });
  assert.equal(h.forum.threadCount, 1);
});

test('create verifies the starter message by thread ID when the response omits it', async () => {
  const h = harness();
  h.forum.createMode = 'no_starter_in_response';
  await deliver(h, createClaim());
  assert.equal(h.forum.callsTo('fetchStarterMessage').length, 1);
  assertResult(h, { outcome: 'linked', code: 'created', createAttempted: true });
});

test('checkpoint lease loss or failure means no Discord create', async () => {
  const lost = harness();
  lost.hub.checkpoints.push({ status: 409, body: { code: 'DELIVERY_LEASE_LOST' } });
  assert.equal((await deliver(lost, createClaim())).kind, 'lease_lost');
  assert.equal(lost.forum.callsTo('createThread').length, 0);
  assert.equal(lost.hub.requestsTo('result').length, 0);

  const failed = harness();
  failed.hub.checkpoints.push({ status: 503 }, { networkError: true }, { status: 500 });
  await deliver(failed, createClaim());
  assert.equal(failed.hub.requestsTo('checkpoint').length, 3);
  assert.equal(failed.forum.callsTo('createThread').length, 0);
  assertResult(failed, {
    outcome: 'retryable',
    code: 'hub_checkpoint_failed',
    createAttempted: false,
  });

  const expiring = harness();
  expiring.hub.checkpoints.push({
    status: 200,
    body: { leaseExpiresAt: '2026-09-12T23:00:10.000Z' },
  });
  await deliver(expiring, createClaim());
  assert.equal(expiring.forum.callsTo('createThread').length, 0);
  assertResult(expiring, { outcome: 'retryable', code: 'lease_expiring', createAttempted: false });
});

interface ConditionRow {
  name: string;
  tags?: string;
  arrange?: (forum: FakeForumPort) => void;
  outcome: string;
  code: string;
  createAttempted: boolean;
  creates: number;
  retryAfterMs?: number;
}

const createConditions: ConditionRow[] = [
  {
    name: 'forum not found',
    arrange: (f) => f.fail('fetchForum', apiError(404, 10003)),
    outcome: 'blocked',
    code: 'forum_unavailable',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'forum wrong type',
    arrange: (f) => {
      f.forum.type = 0;
    },
    outcome: 'blocked',
    code: 'forum_wrong_type',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'forum wrong guild',
    arrange: (f) => {
      f.forum.guildId = '111111111111111111';
    },
    outcome: 'blocked',
    code: 'forum_unavailable',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'forum id differs',
    arrange: (f) => {
      f.forum.id = '222222222222222222';
    },
    outcome: 'blocked',
    code: 'forum_unavailable',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'pre-flight missing access',
    arrange: (f) => f.fail('fetchForum', apiError(403, 50001)),
    outcome: 'blocked',
    code: 'missing_access',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'pre-flight rate limit',
    arrange: (f) =>
      f.fail('fetchForum', failure({ kind: 'rate_limited', retryAfterMs: 900, requestSent: true })),
    outcome: 'retryable',
    code: 'discord_rate_limited',
    createAttempted: false,
    creates: 0,
    retryAfterMs: 900,
  },
  {
    name: 'pre-flight server error',
    arrange: (f) => f.fail('fetchForum', failure({ kind: 'server_error', status: 502 })),
    outcome: 'retryable',
    code: 'discord_unreachable',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'required tag not configured',
    arrange: (f) => {
      f.forum.flags = 16;
    },
    outcome: 'blocked',
    code: 'tag_required_unconfigured',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'configured tag unavailable',
    tags: TAG_MISSING,
    outcome: 'blocked',
    code: 'tag_unavailable',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'configured tag moderated',
    tags: TAG_MODERATED,
    outcome: 'blocked',
    code: 'tag_moderated',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'invalid tag configuration',
    tags: 'not-a-snowflake',
    outcome: 'blocked',
    code: 'tag_unavailable',
    createAttempted: false,
    creates: 0,
  },
  {
    name: 'create missing permissions',
    arrange: (f) => f.fail('createThread', apiError(403, 50013)),
    outcome: 'blocked',
    code: 'missing_permissions',
    createAttempted: false,
    creates: 1,
  },
  {
    name: 'create missing access',
    arrange: (f) => f.fail('createThread', apiError(403, 50001)),
    outcome: 'blocked',
    code: 'missing_access',
    createAttempted: false,
    creates: 1,
  },
  {
    name: 'create tag required',
    arrange: (f) => f.fail('createThread', apiError(400, 40067)),
    outcome: 'blocked',
    code: 'tag_required_unconfigured',
    createAttempted: false,
    creates: 1,
  },
  {
    name: 'create forum vanished',
    arrange: (f) => f.fail('createThread', apiError(404, 10003)),
    outcome: 'blocked',
    code: 'forum_unavailable',
    createAttempted: false,
    creates: 1,
  },
  {
    name: 'create validation error',
    arrange: (f) => f.fail('createThread', apiError(400, 50035)),
    outcome: 'terminal',
    code: 'content_invalid',
    createAttempted: false,
    creates: 1,
  },
  {
    name: 'rate limited before send',
    arrange: (f) =>
      f.fail(
        'createThread',
        failure({ kind: 'rate_limited', retryAfterMs: 1500, requestSent: false }),
      ),
    outcome: 'retryable',
    code: 'discord_rate_limited',
    createAttempted: false,
    creates: 1,
    retryAfterMs: 1500,
  },
  {
    name: '429 response received (A3 unverified, fail closed)',
    arrange: (f) =>
      f.fail(
        'createThread',
        failure({ kind: 'rate_limited', retryAfterMs: 1500, requestSent: true }),
      ),
    outcome: 'unknown',
    code: 'discord_rate_limited_unverified',
    createAttempted: true,
    creates: 1,
  },
  {
    name: 'unreachable before send',
    arrange: (f) => f.fail('createThread', failure({ kind: 'network', requestSent: false })),
    outcome: 'retryable',
    code: 'discord_unreachable',
    createAttempted: false,
    creates: 1,
  },
  {
    name: 'timeout',
    arrange: (f) => f.fail('createThread', failure({ kind: 'timeout' })),
    outcome: 'unknown',
    code: 'discord_response_lost',
    createAttempted: true,
    creates: 1,
  },
  {
    name: 'reset after send',
    arrange: (f) => f.fail('createThread', failure({ kind: 'network', requestSent: true })),
    outcome: 'unknown',
    code: 'discord_response_lost',
    createAttempted: true,
    creates: 1,
  },
  {
    name: '5xx',
    arrange: (f) => f.fail('createThread', failure({ kind: 'server_error', status: 503 })),
    outcome: 'unknown',
    code: 'discord_server_error',
    createAttempted: true,
    creates: 1,
  },
  {
    name: 'malformed 2xx',
    arrange: (f) => {
      f.createMode = 'malformed';
    },
    outcome: 'unknown',
    code: 'discord_response_lost',
    createAttempted: true,
    creates: 1,
  },
  {
    name: '2xx with wrong parent',
    arrange: (f) => {
      f.createMode = 'wrong_parent';
    },
    outcome: 'unknown',
    code: 'discord_response_lost',
    createAttempted: true,
    creates: 1,
  },
  {
    name: '2xx with different content',
    arrange: (f) => {
      f.createMode = 'altered_content';
    },
    outcome: 'unknown',
    code: 'discord_response_lost',
    createAttempted: true,
    creates: 1,
  },
  {
    name: 'regression 2xx with a different thread name',
    arrange: (f) => {
      f.createMode = 'renamed_thread';
    },
    outcome: 'unknown',
    code: 'discord_response_lost',
    createAttempted: true,
    creates: 1,
  },
];

for (const row of createConditions)
  test(`create condition: ${row.name} → ${row.outcome}/${row.code}`, async () => {
    const h = harness({ tags: row.tags });
    row.arrange?.(h.forum);
    await deliver(h, createClaim());
    assert.equal(h.forum.callsTo('createThread').length, row.creates);
    assert.equal(h.hub.requestsTo('checkpoint').length, row.creates);
    const result = assertResult(h, {
      outcome: row.outcome,
      code: row.code,
      createAttempted: row.createAttempted,
    });
    assert.equal(result.retryAfterMs, row.retryAfterMs);
    assert.equal(result.discord, undefined);
  });

// ---------------------------------------------------------------------------
// Response loss, reconcile, restart
// ---------------------------------------------------------------------------

test('accepted-but-lost create reconciles to exactly one thread and never re-creates', async () => {
  const h = harness();
  h.forum.createMode = 'accept_then_timeout';
  await deliver(h, createClaim());
  assertResult(h, { outcome: 'unknown', code: 'discord_response_lost', createAttempted: true });
  assert.equal(h.forum.threadCount, 1);

  await deliver(h, reconcileClaim());
  const threadId = [...h.forum.threads.keys()][0];
  assertResult(h, {
    outcome: 'linked',
    code: 'reconciled',
    resolution: 'reconciled',
    createAttempted: false,
    scan: { activeComplete: true, archivedComplete: true },
  });
  assert.equal((h.hub.lastResult() as Json).discord.threadId, threadId);
  assert.equal(h.forum.callsTo('createThread').length, 1);
  assert.equal(h.forum.threadCount, 1);
});

test('process restart after a create completes through a fresh worker reconcile', async () => {
  const forum = new FakeForumPort();
  const hub = new FakeHub();
  const before = harness({ forum, hub });
  hub.results.push(...Array(10).fill({ status: 503 }));
  const first = await deliver(before, createClaim());
  assert.equal(first.kind, 'reported');
  assert.equal(first.kind === 'reported' && first.hub, 'failed');
  hub.results.length = 0;

  const after = harness({ forum, hub });
  await deliver(after, reconcileClaim({ attempt: 2 }));
  assertResult(after, { outcome: 'linked', resolution: 'reconciled', attempt: 2 });
  assert.equal(forum.callsTo('createThread').length, 1);
  assert.equal(forum.threadCount, 1);
});

function markerThread(forum: FakeForumPort, overrides: Json = {}) {
  return forum.addThread({
    createdAt: NOW - 8 * 60_000,
    content: `Intro\n\n${MARKER}`,
    ...overrides,
  });
}

test('reconcile finds a marker thread on a later archived page', async () => {
  const h = harness();
  for (let i = 0; i < 5; i += 1)
    h.forum.addThread({
      archived: true,
      archiveTimestamp: `2026-09-12T22:5${i}:30.000Z`,
      content: 'other',
    });
  const ours = markerThread(h.forum, {
    archived: true,
    archiveTimestamp: '2026-09-12T22:40:00.000Z',
    locked: true,
  });
  await deliver(h, reconcileClaim());
  assert.ok(h.forum.callsTo('listArchivedPage').length >= 3);
  const result = assertResult(h, { outcome: 'linked', resolution: 'reconciled' });
  assert.equal(result.discord.threadId, ours.id);
  assert.equal(result.discord.archived, true);
  assert.equal(result.discord.locked, true);
});

// Archived pages at the production size, with ties on the page-boundary archive timestamp.
const BOUNDARY_ARCHIVED_AT = new Date(NOW - 100_000).toISOString();

function fillArchivedPageBeforeBoundary(forum: FakeForumPort, rows: number): void {
  forum.archivedPageSize = 100;
  for (let i = 0; i < rows; i += 1)
    forum.addThread({
      archived: true,
      archiveTimestamp: new Date(NOW - i * 1000).toISOString(),
      ownerId: OTHER_USER_ID,
    });
}

test('reconcile regression: a sole marker hidden at an archive timestamp boundary is not reported absent', async () => {
  const h = harness();
  fillArchivedPageBeforeBoundary(h.forum, 99);
  h.forum.addThread({
    archived: true,
    archiveTimestamp: BOUNDARY_ARCHIVED_AT,
    ownerId: OTHER_USER_ID,
  });
  const hidden = markerThread(h.forum, { archived: true, archiveTimestamp: BOUNDARY_ARCHIVED_AT });
  await deliver(h, reconcileClaim());
  const result = assertResult(h, { outcome: 'linked', resolution: 'reconciled' });
  assert.equal(result.discord.threadId, hidden.id);
  assert.deepEqual(result.scan, { activeComplete: true, archivedComplete: true });
  assert.deepEqual(h.forum.callsTo('fetchStarterMessage'), [[hidden.id]]);
});

test('reconcile regression: a second marker hidden at an archive timestamp boundary prevents a single-match link', async () => {
  const h = harness();
  fillArchivedPageBeforeBoundary(h.forum, 99);
  const visible = markerThread(h.forum, { archived: true, archiveTimestamp: BOUNDARY_ARCHIVED_AT });
  const hidden = markerThread(h.forum, { archived: true, archiveTimestamp: BOUNDARY_ARCHIVED_AT });
  await deliver(h, reconcileClaim());
  const result = assertResult(h, { outcome: 'conflict', code: 'reconcile_multiple_matches' });
  assert.deepEqual([...result.candidateThreadIds].sort(), [visible.id, hidden.id].sort());
});

test('reconcile regression: an archive cursor that cannot be shown to re-cover the boundary is incomplete', async () => {
  for (const second of [false, true]) {
    const h = harness();
    h.forum.archivedCursorPrecisionMs = 1000;
    fillArchivedPageBeforeBoundary(h.forum, 99);
    if (second) markerThread(h.forum, { archived: true, archiveTimestamp: BOUNDARY_ARCHIVED_AT });
    else
      h.forum.addThread({
        archived: true,
        archiveTimestamp: BOUNDARY_ARCHIVED_AT,
        ownerId: OTHER_USER_ID,
      });
    markerThread(h.forum, { archived: true, archiveTimestamp: BOUNDARY_ARCHIVED_AT });
    await deliver(h, reconcileClaim());
    assertResult(h, {
      outcome: 'unknown',
      code: 'reconcile_incomplete',
      scan: { activeComplete: true, archivedComplete: false },
    });
  }
});

test('reconcile regression: a timestamp tie larger than one archived page is incomplete', async () => {
  const h = harness();
  h.forum.archivedPageSize = 2;
  for (let i = 0; i < 3; i += 1)
    h.forum.addThread({
      archived: true,
      archiveTimestamp: BOUNDARY_ARCHIVED_AT,
      ownerId: OTHER_USER_ID,
    });
  await deliver(h, reconcileClaim());
  assertResult(h, {
    outcome: 'unknown',
    code: 'reconcile_incomplete',
    scan: { activeComplete: true, archivedComplete: false },
  });
});

test('reconcile still proves absence when a boundary tie is re-covered by the next page', async () => {
  const h = harness();
  h.forum.archivedPageSize = 3;
  for (const archiveTimestamp of [
    '2026-09-12T22:40:00.000Z',
    '2026-09-12T22:30:00.000Z',
    BOUNDARY_ARCHIVED_AT,
    BOUNDARY_ARCHIVED_AT,
    '2026-09-12T22:10:00.000Z',
  ])
    h.forum.addThread({ archived: true, archiveTimestamp, ownerId: OTHER_USER_ID });
  await deliver(h, reconcileClaim());
  assertResult(h, {
    outcome: 'absent',
    code: 'reconcile_absent',
    scan: { activeComplete: true, archivedComplete: true },
  });
  assert.equal(h.forum.callsTo('listArchivedPage').length, 2, 'the tie split across two pages');
});

test('reconcile regression: an invalid claimed post is terminal content_invalid before any Discord call', async () => {
  const posts: [string, Json][] = [
    ['untrimmed name', { threadName: ' Synthetic Hub Project ', content: CONTENT }],
    ['oversized name', { threadName: 'x'.repeat(101), content: CONTENT }],
    ['control character in name', { threadName: 'line\nbreak', content: CONTENT }],
    ['oversized content', { threadName: 'Long', content: `${'x'.repeat(1990)}\n${MARKER}` }],
    ['no reference line', { threadName: 'No marker', content: 'no marker here' }],
    ['two reference lines', { threadName: 'Twice', content: `${MARKER}\n${MARKER}` }],
    ['reference not a whole line', { threadName: 'Inline', content: `See ${MARKER}` }],
  ];
  for (const [name, post] of posts) {
    const h = harness();
    // A bot-owned marker thread that would otherwise link, so a skipped check is observable.
    markerThread(h.forum);
    await deliver(h, withPost(reconcileClaim(), post));
    assert.equal(h.forum.calls.length, 0, name);
    assert.equal(h.hub.requestsTo('checkpoint').length, 0, name);
    assertResult(h, { outcome: 'terminal', code: 'content_invalid', createAttempted: false });
  }
});

const reconcileConditions: {
  name: string;
  arrange: (forum: FakeForumPort) => void;
  claim?: Json;
  outcome: string;
  code: string;
  candidates?: number;
  scan?: Json;
}[] = [
  {
    name: 'two marker threads',
    arrange: (f) => {
      markerThread(f);
      markerThread(f, { archived: true });
    },
    outcome: 'conflict',
    code: 'reconcile_multiple_matches',
    candidates: 2,
  },
  {
    name: 'missing starter message',
    arrange: (f) => {
      markerThread(f, { starter: false });
    },
    outcome: 'conflict',
    code: 'reconcile_unverifiable',
    candidates: 1,
  },
  {
    name: 'one match plus one unverifiable',
    arrange: (f) => {
      markerThread(f);
      markerThread(f, { starter: false });
    },
    outcome: 'conflict',
    code: 'reconcile_unverifiable',
    candidates: 2,
  },
  {
    name: 'starter authored by someone else',
    arrange: (f) => {
      markerThread(f, { authorId: OTHER_USER_ID });
    },
    outcome: 'conflict',
    code: 'reconcile_unverifiable',
    candidates: 1,
  },
  {
    name: 'archived page error',
    arrange: (f) => f.fail('listArchivedPage', failure({ kind: 'server_error', status: 500 })),
    outcome: 'unknown',
    code: 'reconcile_incomplete',
    scan: { activeComplete: true, archivedComplete: false },
  },
  {
    name: 'active listing error',
    arrange: (f) => f.fail('listActiveThreads', failure({ kind: 'timeout' })),
    outcome: 'unknown',
    code: 'reconcile_incomplete',
    scan: { activeComplete: false, archivedComplete: true },
  },
  {
    name: 'archived page missing has_more',
    arrange: (f) => {
      f.omitHasMore = true;
    },
    outcome: 'unknown',
    code: 'reconcile_incomplete',
    scan: { activeComplete: true, archivedComplete: false },
  },
  {
    name: 'archived page out of order',
    arrange: (f) => {
      f.archivedPageSize = 2;
      f.unsortedArchivedPages = true;
      f.addThread({ archived: true, archiveTimestamp: '2026-09-12T22:10:00.000Z' });
      f.addThread({ archived: true, archiveTimestamp: '2026-09-12T22:20:00.000Z' });
    },
    outcome: 'unknown',
    code: 'reconcile_incomplete',
    scan: { activeComplete: true, archivedComplete: false },
  },
  {
    name: 'starter fetch transient error',
    arrange: (f) => {
      markerThread(f);
      f.fail('fetchStarterMessage', failure({ kind: 'server_error', status: 502 }));
    },
    outcome: 'unknown',
    code: 'reconcile_incomplete',
  },
  {
    name: 'match with incomplete archived scan',
    arrange: (f) => {
      markerThread(f);
      f.fail('listArchivedPage', failure({ kind: 'timeout' }));
    },
    outcome: 'unknown',
    code: 'reconcile_incomplete',
  },
  {
    name: 'inside the settle window',
    arrange: () => undefined,
    claim: reconcileClaim({
      createWindow: {
        start: '2026-09-12T22:50:00.000Z',
        lastCreateStartedAt: '2026-09-12T22:59:30.000Z',
      },
    }),
    outcome: 'unknown',
    code: 'reconcile_incomplete',
    scan: { activeComplete: true, archivedComplete: true },
  },
  {
    name: 'complete empty scan',
    arrange: () => undefined,
    outcome: 'absent',
    code: 'reconcile_absent',
    scan: { activeComplete: true, archivedComplete: true },
  },
  {
    name: 'marker thread owned by a member is ignored',
    arrange: (f) => {
      markerThread(f, { ownerId: OWNER_ID });
    },
    outcome: 'absent',
    code: 'reconcile_absent',
  },
  {
    name: 'marker thread outside the create window is ignored',
    arrange: (f) => {
      markerThread(f, { createdAt: NOW - 3 * 60 * 60_000 });
    },
    outcome: 'absent',
    code: 'reconcile_absent',
  },
  {
    name: 'marker thread in another forum is ignored',
    arrange: (f) => {
      markerThread(f, { parentId: '222222222222222222' });
    },
    outcome: 'absent',
    code: 'reconcile_absent',
  },
  {
    name: 'marker thread with a non-public thread type (12)',
    arrange: (f) => {
      markerThread(f, { type: 12 });
    },
    outcome: 'conflict',
    code: 'reconcile_unverifiable',
    candidates: 1,
  },
  {
    name: 'wrong-type marker thread alongside an otherwise valid match',
    arrange: (f) => {
      markerThread(f);
      markerThread(f, { type: 10, archived: true });
    },
    outcome: 'conflict',
    code: 'reconcile_unverifiable',
    candidates: 2,
  },
  {
    name: 'wrong-type bot thread without the reference is ignored',
    arrange: (f) => {
      markerThread(f, { type: 12, content: 'unrelated' });
    },
    outcome: 'absent',
    code: 'reconcile_absent',
  },
  {
    name: 'forum inaccessible',
    arrange: (f) => f.fail('fetchForum', apiError(403, 50001)),
    outcome: 'unknown',
    code: 'reconcile_blocked_missing_access',
  },
];

for (const row of reconcileConditions)
  test(`reconcile condition: ${row.name} → ${row.outcome}/${row.code}`, async () => {
    const h = harness();
    h.forum.archivedPageSize = 1;
    row.arrange(h.forum);
    await deliver(h, row.claim ?? reconcileClaim());
    assert.equal(h.forum.callsTo('createThread').length, 0, 'reconcile never creates');
    assert.equal(h.hub.requestsTo('checkpoint').length, 0, 'reconcile never checkpoints a create');
    const result = assertResult(h, {
      outcome: row.outcome,
      code: row.code,
      createAttempted: false,
    });
    if (row.candidates !== undefined)
      assert.equal(result.candidateThreadIds.length, row.candidates);
    if (row.scan) assert.deepEqual(result.scan, row.scan);
  });

// ---------------------------------------------------------------------------
// Connect existing
// ---------------------------------------------------------------------------

function connectTo(forum: FakeForumPort, overrides: Json = {}): Json {
  const thread = forum.addThread({ ownerId: OWNER_ID, content: 'member post', ...overrides });
  return connectClaim({ requestedThreadId: thread.id });
}

const connectConditions: {
  name: string;
  arrange: (forum: FakeForumPort) => Json;
  outcome: string;
  code: string;
  flags?: { archived: boolean; locked: boolean };
}[] = [
  {
    name: 'owner matches',
    arrange: (f) => connectTo(f),
    outcome: 'linked',
    code: 'connected',
    flags: { archived: false, locked: false },
  },
  {
    name: 'archived and locked',
    arrange: (f) => connectTo(f, { archived: true, locked: true }),
    outcome: 'linked',
    code: 'connected',
    flags: { archived: true, locked: true },
  },
  {
    name: 'owner mismatch',
    arrange: (f) => connectTo(f, { ownerId: OTHER_USER_ID }),
    outcome: 'conflict',
    code: 'thread_owner_mismatch',
  },
  {
    name: 'bot-owned thread',
    arrange: (f) => connectTo(f, { ownerId: BOT_USER_ID }),
    outcome: 'conflict',
    code: 'thread_owner_mismatch',
  },
  {
    name: 'Hub owner is the bot',
    arrange: (f) => ({
      ...connectTo(f, { ownerId: BOT_USER_ID }),
      owner: { discordUserId: BOT_USER_ID },
    }),
    outcome: 'conflict',
    code: 'thread_owner_mismatch',
  },
  {
    name: 'wrong parent',
    arrange: (f) => connectTo(f, { parentId: '222222222222222222' }),
    outcome: 'terminal',
    code: 'thread_wrong_parent',
  },
  {
    name: 'wrong guild',
    arrange: (f) => connectTo(f, { guildId: '111111111111111111' }),
    outcome: 'terminal',
    code: 'thread_wrong_parent',
  },
  {
    name: 'not a public thread',
    arrange: (f) => connectTo(f, { type: 12 }),
    outcome: 'terminal',
    code: 'thread_wrong_parent',
  },
  {
    name: 'thread not found',
    arrange: () => connectClaim(),
    outcome: 'terminal',
    code: 'thread_not_found',
  },
  {
    name: 'thread fetch missing access',
    arrange: (f) => {
      f.fail('fetchThread', apiError(403, 50001));
      return connectClaim();
    },
    outcome: 'blocked',
    code: 'missing_access',
  },
  {
    name: 'thread fetch unavailable',
    arrange: (f) => {
      f.fail('fetchThread', failure({ kind: 'timeout' }));
      return connectClaim();
    },
    outcome: 'retryable',
    code: 'discord_unreachable',
  },
];

for (const row of connectConditions)
  test(`connect condition: ${row.name} → ${row.outcome}/${row.code}`, async () => {
    const h = harness();
    const claim = row.arrange(h.forum);
    await deliver(h, claim);
    assert.equal(h.forum.callsTo('createThread').length, 0);
    const result = assertResult(h, {
      outcome: row.outcome,
      code: row.code,
      createAttempted: false,
    });
    if (row.flags) {
      assert.equal(result.resolution, 'connected');
      assert.equal(result.discord.threadId, claim.requestedThreadId);
      assert.equal(result.discord.threadOwnerId, OWNER_ID);
      assert.equal(result.discord.archived, row.flags.archived);
      assert.equal(result.discord.locked, row.flags.locked);
    } else assert.equal(result.discord, undefined);
  });

// ---------------------------------------------------------------------------
// Result delivery and lease loss
// ---------------------------------------------------------------------------

test('result delivery retries transient failures with an identical body', async () => {
  const h = harness();
  h.hub.results.push(
    { status: 503 },
    { networkError: true },
    { status: 200, body: { state: 'linked', idempotent: true } },
  );
  const cycle = await deliver(h, createClaim());
  assert.equal(cycle.kind === 'reported' && cycle.hub, 'ok');
  const bodies = h.hub.requestsTo('result').map((request) => request.rawBody);
  assert.equal(bodies.length, 3);
  assert.equal(new Set(bodies).size, 1);
  assert.equal(h.forum.callsTo('createThread').length, 1);
});

test('result lease loss or rejection stops without retrying', async () => {
  for (const [status, expected] of [
    [409, 'lease_lost'],
    [422, 'rejected'],
    [400, 'rejected'],
  ] as const) {
    const h = harness();
    h.hub.results.push({ status, body: {} });
    const cycle = await deliver(h, createClaim());
    assert.equal(cycle.kind === 'reported' && cycle.hub, expected);
    assert.equal(h.hub.requestsTo('result').length, 1);
  }
});

test('result delivery gives up after bounded attempts', async () => {
  const h = harness();
  h.hub.results.push(...Array(20).fill({ networkError: true }));
  const cycle = await deliver(h, createClaim());
  assert.equal(cycle.kind === 'reported' && cycle.hub, 'failed');
  assert.equal(h.hub.requestsTo('result').length, 6);
});

test('result delivery regression: the lease grace deadline is checked immediately before every send', async () => {
  const deadline = Date.parse(LEASE_EXPIRES_AT) + 60_000;
  const claim = claimSchema.parse(createClaim());
  const result = {
    outcome: 'unknown',
    code: 'discord_response_lost',
    createAttempted: true,
  } as const;
  const run = async (startAt: number, scripted: Json[], fetchMs = 0) => {
    const hub = new FakeHub();
    hub.results.push(...(scripted as never[]));
    let clock = startAt;
    const sleeps: number[] = [];
    const client = new HubClient({
      origin: 'https://hub.example.test',
      token: TOKEN,
      fetch: async (input, init) => {
        clock += fetchMs;
        return hub.fetch(input as string, init);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
      random: () => 0.5,
    });
    const response = await client.reportResult(claim, result, LEASE_EXPIRES_AT);
    return { response, requests: hub.requestsTo('result').length, sleeps };
  };

  // Past the deadline before the first attempt: nothing is sent.
  const late = await run(deadline + 1, []);
  assert.equal(late.response.kind, 'failed');
  assert.equal(late.requests, 0, 'no first attempt after the deadline');

  // Exactly at the deadline the first attempt is still inside the grace window.
  const edge = await run(deadline, []);
  assert.equal(edge.response.kind, 'ok');
  assert.equal(edge.requests, 1);

  // A backoff that carries the clock past the deadline stops before the retry is sent.
  const backoffCrosses = await run(deadline - 500, [{ status: 503 }, { status: 503 }]);
  assert.deepEqual(backoffCrosses.sleeps, [1_000]);
  assert.equal(backoffCrosses.requests, 1, 'no retry after the post-backoff deadline check');
  assert.equal(backoffCrosses.response.kind, 'failed');

  // Control: a slow send that finishes past the deadline is not retried either.
  const slowSend = await run(deadline - 500, [{ status: 503 }], 1_000);
  assert.equal(slowSend.requests, 1);
  assert.equal(slowSend.response.kind, 'failed');

  // Inside the window, retries stay bounded at six attempts.
  const bounded = await run(NOW, Array(20).fill({ networkError: true }));
  assert.equal(bounded.requests, 6);
  assert.equal(bounded.sleeps.length, 5);
  assert.equal(bounded.response.kind, 'failed');
});

// ---------------------------------------------------------------------------
// discord.js-backed ForumPort (real @discordjs/rest with a stubbed transport)
// ---------------------------------------------------------------------------

function fakeClient(rest: Json = {}): Client {
  return { user: { id: BOT_USER_ID }, token: 'synthetic-bot-token', rest } as unknown as Client;
}

test('single-shot create REST disables library retries and rate-limit waiting', () => {
  const rest = createSingleShotRest({ dispatched: false });
  assert.equal(rest.options.retries, 0);
  assert.equal(rest.options.timeout, 15_000);
  assert.equal(typeof rest.options.rejectOnRateLimit, 'function');
});

test('discord.js create performs exactly one transport call per outcome and maps errors', async () => {
  const body = buildCreateThreadBody(createClaim().post as never, []);
  const scenarios: {
    name: string;
    respond: () => Response;
    expected: Json;
  }[] = [
    {
      name: '500',
      respond: () => new Response('{}', { status: 500 }),
      expected: { kind: 'server_error', status: 500 },
    },
    {
      name: '429',
      respond: () =>
        new Response(JSON.stringify({ message: 'rate limited', retry_after: 1.5, global: false }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '1.5' },
        }),
      expected: { kind: 'rate_limited', requestSent: true },
    },
    {
      name: '403',
      respond: () =>
        new Response(JSON.stringify({ code: 50013, message: 'Missing Permissions' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      expected: { kind: 'api', status: 403, code: 50013 },
    },
    {
      name: 'reset',
      respond: () => {
        throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      },
      expected: { kind: 'network', requestSent: true },
    },
    {
      name: 'dns',
      respond: () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' });
      },
      expected: { kind: 'network', requestSent: false },
    },
    {
      name: 'abort',
      respond: () => {
        throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
      },
      expected: { kind: 'timeout' },
    },
  ];
  for (const scenario of scenarios) {
    let transportCalls = 0;
    const port = new DiscordForumPort(fakeClient(), {
      createRest: (tracker) =>
        createSingleShotRest(tracker, async () => {
          transportCalls += 1;
          return scenario.respond();
        }),
    });
    await assert.rejects(port.createThread(GFC_PROJECTS_FORUM_ID, body), (error: unknown) => {
      assert.ok(error instanceof ForumPortError, scenario.name);
      for (const [key, value] of Object.entries(scenario.expected))
        assert.deepEqual((error.failure as Json)[key], value, `${scenario.name}.${key}`);
      return true;
    });
    assert.equal(transportCalls, 1, scenario.name);
  }
});

test('discord.js create sends the exact body and parses the created thread', async () => {
  const body = buildCreateThreadBody(createClaim().post as never, [TAG_OPEN]);
  const sent: { url: string; init: Json }[] = [];
  const threadId = '1300000000000000001';
  const port = new DiscordForumPort(fakeClient(), {
    createRest: (tracker) =>
      createSingleShotRest(tracker, async (url, init) => {
        sent.push({ url, init: init as Json });
        return new Response(
          JSON.stringify({
            id: threadId,
            type: 11,
            guild_id: GFC_GUILD_ID,
            parent_id: GFC_PROJECTS_FORUM_ID,
            owner_id: BOT_USER_ID,
            name: body.name,
            applied_tags: [TAG_OPEN],
            thread_metadata: {
              archived: false,
              locked: false,
              archive_timestamp: '2026-09-12T23:00:00.000Z',
              auto_archive_duration: 4320,
            },
            message: { id: threadId, content: CONTENT, author: { id: BOT_USER_ID } },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }),
  });
  const created = await port.createThread(GFC_PROJECTS_FORUM_ID, body);
  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].url,
    `https://discord.com/api/v10/channels/${GFC_PROJECTS_FORUM_ID}/threads`,
  );
  assert.equal(sent[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(sent[0].init.body as string), body);
  assert.equal(created.thread.id, threadId);
  assert.equal(created.thread.ownerId, BOT_USER_ID);
  assert.deepEqual(created.starterMessage, {
    id: threadId,
    authorId: BOT_USER_ID,
    content: CONTENT,
  });
});

test('discord.js reads use pinned routes, fetch the starter by thread ID, and never hide missing has_more', async () => {
  const gets: { route: string; query?: string }[] = [];
  const thread = (id: string) => ({
    id,
    type: 11,
    guild_id: GFC_GUILD_ID,
    parent_id: GFC_PROJECTS_FORUM_ID,
    owner_id: BOT_USER_ID,
    name: 'n',
    thread_metadata: {
      archived: true,
      locked: false,
      archive_timestamp: '2026-09-12T22:00:00.000Z',
    },
  });
  const rest = {
    get: async (route: string, options?: { query?: URLSearchParams }) => {
      gets.push({ route, query: options?.query?.toString() });
      if (route === `/channels/${GFC_PROJECTS_FORUM_ID}`)
        return {
          id: GFC_PROJECTS_FORUM_ID,
          guild_id: GFC_GUILD_ID,
          type: 15,
          flags: 16,
          available_tags: [
            { id: TAG_OPEN, name: 'x', moderated: false, emoji_id: null, emoji_name: null },
          ],
        };
      if (route === `/guilds/${GFC_GUILD_ID}/threads/active`)
        return { threads: [thread('1300000000000000002')], members: [] };
      if (route === `/channels/${GFC_PROJECTS_FORUM_ID}/threads/archived/public`)
        return { threads: [thread('1300000000000000003')], members: [] };
      if (route === '/channels/1300000000000000003/messages/1300000000000000003')
        return { id: '1300000000000000003', content: MARKER, author: { id: BOT_USER_ID } };
      throw new Error(`unexpected route ${route}`);
    },
  };
  const port = new DiscordForumPort(fakeClient(rest));
  assert.deepEqual(await port.fetchForum(GFC_PROJECTS_FORUM_ID), {
    id: GFC_PROJECTS_FORUM_ID,
    guildId: GFC_GUILD_ID,
    type: 15,
    flags: 16,
    availableTags: [{ id: TAG_OPEN, moderated: false }],
  });
  assert.equal((await port.listActiveThreads(GFC_GUILD_ID))[0].id, '1300000000000000002');
  const page = await port.listArchivedPage(GFC_PROJECTS_FORUM_ID, '2026-09-12T23:00:00.000Z');
  assert.equal(page.hasMore, undefined);
  assert.equal(page.threads[0].archiveTimestamp, '2026-09-12T22:00:00.000Z');
  assert.deepEqual(await port.fetchStarterMessage('1300000000000000003'), {
    id: '1300000000000000003',
    authorId: BOT_USER_ID,
    content: MARKER,
  });
  assert.deepEqual(gets[2], {
    route: `/channels/${GFC_PROJECTS_FORUM_ID}/threads/archived/public`,
    query: 'limit=100&before=2026-09-12T23%3A00%3A00.000Z',
  });
  const malformed = new DiscordForumPort(fakeClient({ get: async () => ({ id: 'nope' }) }));
  await assert.rejects(
    malformed.fetchThread('1300000000000000003'),
    (error: unknown) =>
      error instanceof ForumPortError && error.failure.kind === 'malformed_response',
  );
});

test('discord.js thread parsing regression: an omitted optional locked flag normalizes to false', async () => {
  const threadId = '1300000000000000004';
  const rawThread = (metadata: Json) => ({
    id: threadId,
    type: 11,
    guild_id: GFC_GUILD_ID,
    parent_id: GFC_PROJECTS_FORUM_ID,
    owner_id: BOT_USER_ID,
    name: 'Synthetic Hub Project',
    thread_metadata: metadata,
  });
  const unlocked = { archived: false, archive_timestamp: '2026-09-12T22:00:00.000Z' };

  const reads = new DiscordForumPort(
    fakeClient({
      get: async (route: string) =>
        route === `/channels/${threadId}`
          ? rawThread(unlocked)
          : { threads: [rawThread({ ...unlocked, archived: true })], has_more: false },
    }),
  );
  const fetched = await reads.fetchThread(threadId);
  assert.equal(fetched.locked, false);
  assert.equal(fetched.archived, false);
  assert.equal((await reads.listActiveThreads(GFC_GUILD_ID))[0].locked, false);
  const page = await reads.listArchivedPage(GFC_PROJECTS_FORUM_ID, null);
  assert.equal(page.threads[0].locked, false);
  assert.equal(page.threads[0].archived, true);

  const body = buildCreateThreadBody(createClaim().post as never, []);
  const creates = new DiscordForumPort(fakeClient(), {
    createRest: (tracker) =>
      createSingleShotRest(
        tracker,
        async () =>
          new Response(
            JSON.stringify({
              ...rawThread(unlocked),
              message: { id: threadId, content: CONTENT, author: { id: BOT_USER_ID } },
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          ),
      ),
  });
  assert.equal((await creates.createThread(GFC_PROJECTS_FORUM_ID, body)).thread.locked, false);

  for (const locked of ['false', null, 0, 1]) {
    const port = new DiscordForumPort(
      fakeClient({ get: async () => rawThread({ ...unlocked, locked }) }),
    );
    await assert.rejects(
      port.fetchThread(threadId),
      (error: unknown) =>
        error instanceof ForumPortError && error.failure.kind === 'malformed_response',
      String(locked),
    );
  }
});
