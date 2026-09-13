/**
 * Child process for the shutdown signal tests. It runs the real delivery worker entry point and
 * the real signal/shutdown path against fake Hub and Forum ports, pausing at gates that the
 * parent test releases over IPC. Nothing here touches the network or a real Discord client.
 */

import type { Client } from 'discord.js';
import { startProjectDeliveryWorker, stopProjectDeliveryWorker } from '../../src/hubDelivery';
import type {
  ArchivedThreadPage,
  CreatedThread,
  CreateThreadBody,
} from '../../src/hubDelivery/forumPort';
import { createShutdown, installSignalHandlers } from '../../src/shutdown';
import { BOT_USER_ID, FakeForumPort, FakeHub, TOKEN, type Scripted } from './hubDeliveryFakes';

export type ShutdownScenario =
  | 'checkpoint'
  | 'create'
  | 'reconcile'
  | 'result_retry'
  | 'timeout'
  | 'fresh';

export interface ShutdownChildSetup {
  scenario: ShutdownScenario;
  claim: Record<string, unknown>;
  leaseExpiresAt: string;
  drainTimeoutMs: number;
  results?: Scripted[];
  seedThreads?: [string, unknown][];
}

export interface ShutdownChildSummary {
  status: number;
  events: string[];
  creates: number;
  resultBodies: string[];
  threads: [string, unknown][];
}

type ParentMessage =
  | { type: 'setup'; setup: ShutdownChildSetup }
  | { type: 'release'; gate: string };

globalThis.fetch = (async () => {
  throw new Error('network access is forbidden in shutdown tests');
}) as typeof fetch;

const events: string[] = [];
const releases = new Map<string, () => void>();

function send(message: unknown, callback?: () => void): void {
  process.send?.(message, undefined, undefined, callback);
}

function emit(name: string): void {
  events.push(name);
  send({ type: 'event', name });
}

function gate(name: string): Promise<void> {
  emit(`gate:${name}`);
  return new Promise((resolve) => releases.set(name, resolve));
}

function run(setup: ShutdownChildSetup): void {
  const { scenario } = setup;

  class GatedForum extends FakeForumPort {
    async listArchivedPage(forumId: string, before: string | null): Promise<ArchivedThreadPage> {
      if (scenario === 'reconcile') await gate('reconcile');
      return super.listArchivedPage(forumId, before);
    }

    async createThread(forumId: string, body: CreateThreadBody): Promise<CreatedThread> {
      if (scenario === 'create') await gate('create');
      const created = await super.createThread(forumId, body);
      emit('forum:create_accepted');
      // Discord accepted the create, but the response never arrives before shutdown.
      if (scenario === 'timeout') await gate('timeout');
      return created;
    }
  }

  const forum = new GatedForum({ now: Date.now });
  for (const [id, stored] of setup.seedThreads ?? []) forum.threads.set(id, stored as never);
  const hub = new FakeHub();
  hub.claims.push({ status: 200, body: setup.claim });
  hub.checkpoints.push({ status: 200, body: { leaseExpiresAt: setup.leaseExpiresAt } });
  hub.results.push(...(setup.results ?? []));

  let resultAttempts = 0;
  const hubFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const kind = new URL(String(input)).pathname.split('/').pop();
    if (kind === 'result') resultAttempts += 1;
    emit(`hub:${kind}:sent`);
    if (scenario === 'checkpoint' && kind === 'checkpoint') await gate('checkpoint');
    if (scenario === 'result_retry' && kind === 'result' && resultAttempts === 2)
      await gate('result_retry');
    const response = await hub.fetch(input, init);
    emit(`hub:${kind}:${response.status}`);
    return response;
  }) as typeof globalThis.fetch;

  const stop = createShutdown({
    stopJobs: () => emit('jobs:stopped'),
    drainDelivery: async () => {
      const drain = await stopProjectDeliveryWorker(setup.drainTimeoutMs);
      emit(`drain:${drain}`);
      return drain;
    },
    destroyClient: () => emit('client:destroyed'),
    log: () => undefined,
  });
  installSignalHandlers(
    process,
    (signal) => {
      emit(`signal:${signal}`);
      return stop(signal);
    },
    (status) => {
      emit(`exit:${status}`);
      const summary: ShutdownChildSummary = {
        status,
        events,
        creates: forum.callsTo('createThread').length,
        resultBodies: hub.requestsTo('result').map((request) => request.rawBody),
        threads: [...forum.threads.entries()],
      };
      send({ type: 'summary', summary }, () => process.exit(status));
    },
  );

  const client = {
    user: { id: BOT_USER_ID },
    token: 'synthetic-bot-token',
    rest: {},
  } as unknown as Client;
  const worker = startProjectDeliveryWorker(client, {
    env: {
      GFC_PROJECT_DELIVERY_ENABLED: 'true',
      GFC_PROJECT_HUB_ORIGIN: 'https://hub.example.test',
      GFC_HUB_DELIVERY_TOKEN: TOKEN,
    },
    fetch: hubFetch,
    forum,
    log: () => undefined,
  });
  emit(worker ? 'worker:started' : 'worker:not_started');
}

process.on('message', (message: ParentMessage) => {
  if (message.type === 'release') releases.get(message.gate)?.();
  else run(message.setup);
});
send({ type: 'ready' });
