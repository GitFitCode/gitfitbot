import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseTagConfig } from '../src/hubDelivery/config';
import { resultRequestSchema } from '../src/hubDelivery/contract';
import { HubClient } from '../src/hubDelivery/hubClient';
import {
  PROJECT_DELIVERY_DRAIN_TIMEOUT_MS,
  ProjectDeliveryWorker,
} from '../src/hubDelivery/worker';
import {
  CLIENT_DESTROY_TIMEOUT_MS,
  createShutdown,
  installSignalHandlers,
  SHUTDOWN_BOUND_MS,
} from '../src/shutdown';
import type {
  ShutdownChildSetup,
  ShutdownChildSummary,
  ShutdownScenario,
} from './support/deliveryShutdownChild';
import {
  BOT_USER_ID,
  FakeForumPort,
  FakeHub,
  LEASE_EXPIRES_AT,
  TOKEN,
} from './support/hubDeliveryFakes';

globalThis.fetch = (async () => {
  throw new Error('network access is forbidden in hub-delivery tests');
}) as typeof fetch;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const fixtureDir = path.join(__dirname, 'fixtures', 'discord-delivery.v1');
const fixture = (name: string): Json =>
  JSON.parse(readFileSync(path.join(fixtureDir, name), 'utf8')) as Json;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function within<T>(promise: Promise<T>, ms: number): Promise<T | 'still_pending'> {
  return Promise.race([promise, delay(ms).then(() => 'still_pending' as const)]);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// Bounded, idempotent worker drain
// ---------------------------------------------------------------------------

function gatedWorker() {
  const hub = new FakeHub();
  hub.claims.push({ status: 200, body: fixture('claim-create.json') });
  const checkpointGate = deferred();
  const atCheckpoint = deferred();
  const forum = new FakeForumPort();
  const worker = new ProjectDeliveryWorker({
    hub: new HubClient({
      origin: 'https://hub.example.test',
      token: TOKEN,
      fetch: async (input, init) => {
        if (String(input).endsWith('/checkpoint')) {
          atCheckpoint.resolve();
          await checkpointGate.promise;
        }
        return hub.fetch(input as string, init);
      },
      now: () => Date.parse(LEASE_EXPIRES_AT) - 4 * 60_000,
      sleep: async () => undefined,
    }),
    forum,
    botUserId: BOT_USER_ID,
    tags: parseTagConfig(''),
    now: () => Date.parse(LEASE_EXPIRES_AT) - 4 * 60_000,
    log: () => undefined,
  });
  return { hub, forum, worker, checkpointGate, atCheckpoint };
}

test('shutdown drain regression: worker stop waits for the in-flight cycle and repeated stops share one drain', async () => {
  const { hub, forum, worker, checkpointGate, atCheckpoint } = gatedWorker();
  worker.start();
  await atCheckpoint.promise;
  const first = worker.stop(5_000);
  const second = worker.stop(5_000);
  assert.equal(first, second, 'repeated stops return the same drain');
  assert.equal(
    await within(first, 50),
    'still_pending',
    'stop waits while the checkpoint is in flight',
  );
  checkpointGate.resolve();
  assert.equal(await within(first, 2_000), 'stopped');
  assert.equal(forum.callsTo('createThread').length, 1);
  assert.equal(hub.requestsTo('result').length, 1);
  assert.equal(hub.requestsTo('claim').length, 1, 'no claim after stop');
  worker.start();
  assert.equal(hub.requestsTo('claim').length, 1, 'a stopped worker never restarts');
});

test('shutdown drain regression: worker stop gives up on a stuck cycle after its bound', async () => {
  const { forum, worker, atCheckpoint } = gatedWorker();
  worker.start();
  await atCheckpoint.promise;
  const started = Date.now();
  assert.equal(await within(worker.stop(100), 2_000), 'timed_out');
  assert.ok(Date.now() - started < 1_000);
  assert.equal(
    forum.callsTo('createThread').length,
    0,
    'the stuck checkpoint never led to a create',
  );
  assert.equal(PROJECT_DELIVERY_DRAIN_TIMEOUT_MS, 45_000);
});

// ---------------------------------------------------------------------------
// Shutdown sequencing and signal handling
// ---------------------------------------------------------------------------

test('shutdown drains delivery before destroying the client, once, however often it is called', async () => {
  const steps: string[] = [];
  const drainGate = deferred();
  const stop = createShutdown({
    stopJobs: () => steps.push('jobs'),
    drainDelivery: async () => {
      steps.push('drain:start');
      await drainGate.promise;
      steps.push('drain:end');
      return 'stopped';
    },
    destroyClient: async () => {
      steps.push('destroy');
    },
    log: () => undefined,
  });
  const first = stop('SIGTERM');
  const second = stop('SIGINT');
  assert.equal(first, second);
  assert.equal(await within(first, 50), 'still_pending');
  assert.deepEqual(steps, ['jobs', 'drain:start']);
  drainGate.resolve();
  await first;
  await stop('SIGTERM');
  assert.deepEqual(steps, ['jobs', 'drain:start', 'drain:end', 'destroy']);
});

test('shutdown still destroys the client when the drain fails, and bounds a hanging destroy', async () => {
  const steps: string[] = [];
  const stop = createShutdown({
    stopJobs: () => {
      throw new Error('cron failure');
    },
    drainDelivery: async () => {
      throw new Error('drain failure');
    },
    destroyClient: () => {
      steps.push('destroy');
      return new Promise<void>(() => undefined);
    },
    log: (line) => steps.push(line),
    destroyTimeoutMs: 50,
  });
  assert.equal(await within(stop('SIGTERM'), 2_000), undefined);
  assert.ok(steps.includes('destroy'));
  assert.ok(steps.some((line) => line.includes('drain=failed')));
  assert.equal(CLIENT_DESTROY_TIMEOUT_MS, 5_000);
  assert.equal(SHUTDOWN_BOUND_MS, PROJECT_DELIVERY_DRAIN_TIMEOUT_MS + CLIENT_DESTROY_TIMEOUT_MS);
});

test('signal handlers exit exactly once, only after shutdown completes', async () => {
  const emitter = new EventEmitter();
  const gate = deferred();
  const exits: number[] = [];
  let stops = 0;
  const shared = gate.promise;
  installSignalHandlers(
    emitter as unknown as NodeJS.Process,
    () => {
      stops += 1;
      return shared;
    },
    (status) => exits.push(status),
  );
  emitter.emit('SIGTERM', 'SIGTERM');
  emitter.emit('SIGINT', 'SIGINT');
  emitter.emit('SIGTERM', 'SIGTERM');
  await delay(20);
  assert.equal(stops, 3);
  assert.deepEqual(exits, [], 'no exit while shutdown is running');
  gate.resolve();
  await delay(20);
  assert.deepEqual(exits, [0]);

  const failing = new EventEmitter();
  const failedExits: number[] = [];
  installSignalHandlers(
    failing as unknown as NodeJS.Process,
    () => Promise.reject(new Error('boom')),
    (status) => failedExits.push(status),
  );
  failing.emit('SIGTERM', 'SIGTERM');
  await delay(20);
  assert.deepEqual(failedExits, [1]);
});

test('the PM2 termination budget exceeds the application shutdown bound with margin', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ecosystem = require('../ecosystem.config.js') as { apps: { kill_timeout?: number }[] };
  const [app] = ecosystem.apps;
  assert.equal(typeof app.kill_timeout, 'number');
  assert.ok(
    (app.kill_timeout ?? 0) >= SHUTDOWN_BOUND_MS + 10_000,
    `kill_timeout=${app.kill_timeout}`,
  );
  const docs = readFileSync(path.join(__dirname, '..', 'docs', 'COMMANDS.md'), 'utf8');
  assert.ok(docs.includes(`kill_timeout: ${app.kill_timeout}`), 'runbook states the PM2 budget');
});

// ---------------------------------------------------------------------------
// Process-level SIGTERM with fake Hub/Forum ports
// ---------------------------------------------------------------------------

const CHILD = path.join(__dirname, 'support', 'deliveryShutdownChild.ts');

interface ChildRun {
  code: number | null;
  signal: NodeJS.Signals | null;
  summary: ShutdownChildSummary;
}

interface ChildOptions {
  scenario: ShutdownScenario;
  claim: Json;
  results?: ShutdownChildSetup['results'];
  seedThreads?: [string, unknown][];
  drainTimeoutMs?: number;
  /** Event that triggers the signals; defaults to the scenario's gate. */
  signalOn?: string;
  signals?: NodeJS.Signals[];
  release?: boolean;
}

function liveClaim(name: string): { claim: Json; leaseExpiresAt: string } {
  const now = Date.now();
  const leaseExpiresAt = new Date(now + 5 * 60_000).toISOString();
  const claim: Json = { ...fixture(name), leaseExpiresAt };
  if (claim.operation === 'reconcile')
    claim.createWindow = {
      start: new Date(now - 10 * 60_000).toISOString(),
      lastCreateStartedAt: new Date(now - 5 * 60_000).toISOString(),
    };
  return { claim, leaseExpiresAt };
}

function runChild(options: ChildOptions): Promise<ChildRun> {
  return new Promise((resolve, reject) => {
    const child = fork(CHILD, [], {
      execArgv: ['--require', 'ts-node/register'],
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const seen: string[] = [];
    let summary: ShutdownChildSummary | undefined;
    let signalled = false;
    const guard = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`child did not exit; events: ${seen.join(' ')}`));
    }, 60_000);
    const trigger = options.signalOn ?? `gate:${options.scenario}`;

    const signalThenRelease = async () => {
      for (const [index, signal] of (options.signals ?? ['SIGTERM']).entries()) {
        const expected = (options.signals ?? ['SIGTERM'])
          .slice(0, index + 1)
          .filter((s) => s === signal).length;
        child.kill(signal);
        while (seen.filter((event) => event === `signal:${signal}`).length < expected)
          await delay(5);
      }
      if (options.release !== false && trigger.startsWith('gate:'))
        child.send({ type: 'release', gate: trigger.slice('gate:'.length) });
    };

    child.on('message', (message: Json) => {
      if (message.type === 'ready') {
        const setup: ShutdownChildSetup = {
          scenario: options.scenario,
          claim: options.claim,
          leaseExpiresAt: options.claim.leaseExpiresAt,
          drainTimeoutMs: options.drainTimeoutMs ?? 10_000,
          results: options.results,
          seedThreads: options.seedThreads,
        };
        child.send({ type: 'setup', setup });
      } else if (message.type === 'event') {
        seen.push(message.name);
        if (message.name === trigger && !signalled) {
          signalled = true;
          void signalThenRelease();
        }
      } else if (message.type === 'summary') summary = message.summary;
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      clearTimeout(guard);
      if (!summary) reject(new Error(`child exited without a summary; events: ${seen.join(' ')}`));
      else resolve({ code, signal, summary });
    });
  });
}

function index(events: string[], name: string): number {
  const at = events.indexOf(name);
  assert.ok(at >= 0, `missing ${name}: ${events.join(' ')}`);
  return at;
}

function assertOrder(events: string[], ...names: string[]): void {
  for (let i = 1; i < names.length; i += 1)
    assert.ok(
      index(events, names[i - 1]) < index(events, names[i]),
      `${names[i - 1]} before ${names[i]}: ${events.join(' ')}`,
    );
}

function assertGracefulExit(run: ChildRun, drain: 'stopped' | 'timed_out'): void {
  const { events } = run.summary;
  assert.equal(run.signal, null, 'exited on its own, not killed');
  assert.equal(run.code, 0);
  for (const name of [`drain:${drain}`, 'client:destroyed', 'exit:0'])
    assert.equal(events.filter((event) => event === name).length, 1, name);
  assertOrder(events, 'signal:SIGTERM', `drain:${drain}`, 'client:destroyed', 'exit:0');
}

function parsedResults(run: ChildRun): Json[] {
  return run.summary.resultBodies.map((body) => {
    const parsed = JSON.parse(body) as Json;
    assert.equal(resultRequestSchema.safeParse(parsed).success, true);
    return parsed;
  });
}

test('process SIGTERM during checkpoint waits for create and result before destroying the client', async () => {
  const run = await runChild({ scenario: 'checkpoint', ...liveClaim('claim-create.json') });
  assertGracefulExit(run, 'stopped');
  assertOrder(
    run.summary.events,
    'signal:SIGTERM',
    'hub:checkpoint:200',
    'forum:create_accepted',
    'hub:result:200',
    'drain:stopped',
  );
  assert.equal(run.summary.creates, 1);
  const [result] = parsedResults(run);
  assert.equal(result.outcome, 'linked');
  assert.equal(result.resolution, 'created');
});

test('process SIGTERM during create keeps one create and reports it before exit', async () => {
  const run = await runChild({ scenario: 'create', ...liveClaim('claim-create.json') });
  assertGracefulExit(run, 'stopped');
  assertOrder(run.summary.events, 'signal:SIGTERM', 'forum:create_accepted', 'hub:result:200');
  assert.equal(run.summary.creates, 1);
  assert.equal(parsedResults(run).length, 1);
});

test('process SIGTERM during a reconcile scan finishes the scan and reports without creating', async () => {
  const { claim, leaseExpiresAt } = liveClaim('claim-reconcile.json');
  const seedForum = new FakeForumPort({ now: Date.now });
  seedForum.addThread({ content: fixture('claim-reconcile.json').post.content });
  const run = await runChild({
    scenario: 'reconcile',
    claim: { ...claim, leaseExpiresAt },
    seedThreads: [...seedForum.threads.entries()],
  });
  assertGracefulExit(run, 'stopped');
  assertOrder(run.summary.events, 'signal:SIGTERM', 'hub:result:200', 'drain:stopped');
  assert.equal(run.summary.creates, 0);
  const [result] = parsedResults(run);
  assert.equal(result.resolution, 'reconciled');
});

test('process SIGTERM during result retry keeps retrying the byte-identical body before exit', async () => {
  const run = await runChild({
    scenario: 'result_retry',
    ...liveClaim('claim-create.json'),
    results: [{ status: 503 }],
  });
  assertGracefulExit(run, 'stopped');
  assertOrder(
    run.summary.events,
    'hub:result:503',
    'signal:SIGTERM',
    'hub:result:200',
    'drain:stopped',
  );
  assert.equal(run.summary.creates, 1);
  assert.equal(run.summary.resultBodies.length, 2);
  assert.equal(new Set(run.summary.resultBodies).size, 1);
});

test('repeated SIGTERM/SIGINT during a drain destroy the client and exit exactly once', async () => {
  const run = await runChild({
    scenario: 'checkpoint',
    ...liveClaim('claim-create.json'),
    signals: ['SIGTERM', 'SIGINT', 'SIGTERM'],
  });
  assertGracefulExit(run, 'stopped');
  const { events } = run.summary;
  assert.equal(events.filter((event) => event.startsWith('signal:')).length, 3);
  assert.equal(events.filter((event) => event === 'jobs:stopped').length, 1);
  assert.equal(run.summary.creates, 1);
  assert.equal(run.summary.resultBodies.length, 1);
});

test('a timed-out drain exits without a result, and a fresh process reconciles without a second create', async () => {
  const timedOut = await runChild({
    scenario: 'timeout',
    ...liveClaim('claim-create.json'),
    drainTimeoutMs: 300,
    release: false,
  });
  assertGracefulExit(timedOut, 'timed_out');
  assertOrder(
    timedOut.summary.events,
    'forum:create_accepted',
    'signal:SIGTERM',
    'drain:timed_out',
  );
  assert.equal(timedOut.summary.creates, 1);
  assert.equal(timedOut.summary.resultBodies.length, 0, 'the Hub lease, not the bot, decides next');
  assert.equal(timedOut.summary.threads.length, 1);

  const fresh = await runChild({
    scenario: 'fresh',
    ...liveClaim('claim-reconcile.json'),
    seedThreads: timedOut.summary.threads,
    signalOn: 'hub:result:200',
  });
  assertGracefulExit(fresh, 'stopped');
  assert.equal(fresh.summary.creates, 0);
  assert.equal(fresh.summary.threads.length, 1);
  const [result] = parsedResults(fresh);
  assert.equal(result.outcome, 'linked');
  assert.equal(result.resolution, 'reconciled');
  assert.equal(result.discord.threadId, timedOut.summary.threads[0][0]);
});
