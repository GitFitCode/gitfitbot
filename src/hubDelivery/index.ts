/**
 * Project Hub → gfc-projects forum delivery (GitFitBot #102).
 *
 * Outbound-only and default-off: the worker starts only when
 * GFC_PROJECT_DELIVERY_ENABLED=true with a valid GFC_PROJECT_HUB_ORIGIN and
 * GFC_HUB_DELIVERY_TOKEN. It stores no project or delivery state.
 */

import type { Client } from 'discord.js';
import { readDeliveryConfig } from './config';
import { DiscordForumPort, type ForumPort } from './forumPort';
import { HubClient } from './hubClient';
import {
  PROJECT_DELIVERY_DRAIN_TIMEOUT_MS,
  ProjectDeliveryWorker,
  type DrainResult,
} from './worker';

export interface StartDeliveryOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  log?: (line: string) => void;
  /** Replaces the discord.js-backed port; used by the process-level shutdown tests. */
  forum?: ForumPort;
}

let activeWorker: ProjectDeliveryWorker | null = null;
let stopping: Promise<DrainResult | 'idle'> | null = null;

export function startProjectDeliveryWorker(
  client: Client,
  options: StartDeliveryOptions = {},
): ProjectDeliveryWorker | null {
  // Never start (or restart) while a shutdown is draining.
  if (stopping) return null;
  if (activeWorker) return activeWorker;
  const log = options.log ?? ((line: string) => console.log(line));

  const config = readDeliveryConfig(options.env ?? process.env);
  if (!config.enabled) {
    if (config.reason !== 'disabled') log(`[HUB DELIVERY] Not started: ${config.reason}.`);
    return null;
  }
  const botUserId = client.user?.id;
  if (!botUserId) {
    log('[HUB DELIVERY] Not started: bot user is unavailable.');
    return null;
  }

  activeWorker = new ProjectDeliveryWorker({
    hub: new HubClient({ origin: config.origin, token: config.token, fetch: options.fetch }),
    forum: options.forum ?? new DiscordForumPort(client),
    botUserId,
    tags: config.tags,
    log,
  });
  activeWorker.start();
  log('[HUB DELIVERY] Worker started.');
  return activeWorker;
}

/**
 * Stops the worker, waiting at most `timeoutMs` for an in-flight cycle. Concurrent calls share
 * one drain; `idle` means no worker was running.
 */
export function stopProjectDeliveryWorker(
  timeoutMs = PROJECT_DELIVERY_DRAIN_TIMEOUT_MS,
): Promise<DrainResult | 'idle'> {
  if (!stopping) {
    const worker = activeWorker;
    const drain: Promise<DrainResult | 'idle'> = worker
      ? worker.stop(timeoutMs)
      : Promise.resolve('idle');
    stopping = drain.finally(() => {
      activeWorker = null;
      stopping = null;
    });
  }
  return stopping;
}
