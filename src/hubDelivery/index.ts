/**
 * Project Hub → gfc-projects forum delivery (GitFitBot #102).
 *
 * Outbound-only and default-off: the worker starts only when
 * GFC_PROJECT_DELIVERY_ENABLED=true with a valid GFC_PROJECT_HUB_ORIGIN and
 * GFC_HUB_DELIVERY_TOKEN. It stores no project or delivery state.
 */

import type { Client } from 'discord.js';
import { readDeliveryConfig } from './config';
import { DiscordForumPort } from './forumPort';
import { HubClient } from './hubClient';
import { ProjectDeliveryWorker } from './worker';

export interface StartDeliveryOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

let activeWorker: ProjectDeliveryWorker | null = null;

export function startProjectDeliveryWorker(
  client: Client,
  options: StartDeliveryOptions = {},
): ProjectDeliveryWorker | null {
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
    forum: new DiscordForumPort(client),
    botUserId,
    tags: config.tags,
    log,
  });
  activeWorker.start();
  log('[HUB DELIVERY] Worker started.');
  return activeWorker;
}

export async function stopProjectDeliveryWorker(): Promise<void> {
  const worker = activeWorker;
  activeWorker = null;
  await worker?.stop();
}
