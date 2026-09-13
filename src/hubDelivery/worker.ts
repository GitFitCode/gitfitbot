/**
 * Single-flight poll loop: claim one delivery, run its operation, report the result.
 * The worker holds no durable state — the Hub's lease/attempt fencing is the only memory,
 * so a restarted process simply resumes from whatever the Hub hands out next.
 */

import type { TagConfig } from './config';
import { runConnect } from './connect';
import type { DeliveryClaim, DeliveryResult } from './contract';
import { runCreate } from './create';
import type { ForumPort } from './forumPort';
import type { HubClient, ResultResponse } from './hubClient';
import { outcome, type OperationContext, type OperationOutcome } from './operation';
import { runReconcile } from './reconcile';

export const IDLE_POLL_MS = 15_000;
const AFTER_WORK_POLL_MS = 1_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 300_000;
const LOG_PREFIX = '[HUB DELIVERY]';

/** Longest a shutdown waits for an in-flight cycle. The cycle itself is never aborted. */
export const PROJECT_DELIVERY_DRAIN_TIMEOUT_MS = 45_000;

export type DrainResult = 'stopped' | 'timed_out';

export type CycleResult =
  | { kind: 'busy' }
  | { kind: 'idle' }
  | { kind: 'unavailable'; status: number | null }
  | { kind: 'invalid_claim' }
  | { kind: 'lease_lost'; deliveryId: string }
  | { kind: 'reported'; deliveryId: string; result: DeliveryResult; hub: ResultResponse['kind'] };

export interface ProjectDeliveryWorkerOptions {
  hub: HubClient;
  forum: ForumPort;
  botUserId: string;
  tags: TagConfig;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  log?: (line: string) => void;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class ProjectDeliveryWorker {
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly random: () => number;
  private readonly log: (line: string) => void;
  private cycleInFlight = false;
  private consecutiveFailures = 0;
  private loop: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private stopping: Promise<DrainResult> | null = null;

  constructor(private readonly options: ProjectDeliveryWorkerOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? abortableSleep;
    this.random = options.random ?? Math.random;
    this.log = options.log ?? ((line) => console.log(line));
  }

  /** Starts the poll loop once; repeated calls and calls after `stop` are no-ops. */
  start(): void {
    if (this.loop || this.stopping) return;
    const controller = new AbortController();
    this.controller = controller;
    this.loop = this.run(controller.signal);
  }

  /**
   * Interrupts the idle sleep (or a pending claim) and waits at most `timeoutMs` for the
   * in-flight cycle. A cycle still running at the bound keeps its checkpoint fencing: whatever
   * it may have created is left to the Hub's lease expiry and reconcile. Repeated calls share
   * the first call's drain.
   */
  stop(timeoutMs = PROJECT_DELIVERY_DRAIN_TIMEOUT_MS): Promise<DrainResult> {
    this.stopping ??= this.drain(timeoutMs);
    return this.stopping;
  }

  private async drain(timeoutMs: number): Promise<DrainResult> {
    const loop = this.loop;
    this.controller?.abort();
    this.controller = null;
    this.loop = null;
    if (!loop) return 'stopped';
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<DrainResult>((resolve) => {
      timer = setTimeout(() => resolve('timed_out'), timeoutMs);
    });
    try {
      return await Promise.race([loop.then((): DrainResult => 'stopped'), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One claim → operation → result cycle. Concurrent calls return `busy`. */
  async runOnce(signal?: AbortSignal): Promise<CycleResult> {
    if (this.cycleInFlight) return { kind: 'busy' };
    this.cycleInFlight = true;
    try {
      return await this.cycle(signal);
    } finally {
      this.cycleInFlight = false;
    }
  }

  private async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let result: CycleResult;
      try {
        result = await this.runOnce(signal);
      } catch {
        result = { kind: 'unavailable', status: null };
      }
      if (signal.aborted) break;
      try {
        await this.sleep(this.nextDelay(result), signal);
      } catch {
        break;
      }
    }
  }

  private nextDelay(result: CycleResult): number {
    const jitter = 0.8 + 0.4 * this.random();
    if (result.kind === 'unavailable' || result.kind === 'invalid_claim') {
      this.consecutiveFailures += 1;
      const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (this.consecutiveFailures - 1));
      return Math.round(base * jitter);
    }
    this.consecutiveFailures = 0;
    const base =
      result.kind === 'reported' || result.kind === 'lease_lost'
        ? AFTER_WORK_POLL_MS
        : IDLE_POLL_MS;
    return Math.round(base * jitter);
  }

  private async cycle(signal?: AbortSignal): Promise<CycleResult> {
    const claimed = await this.options.hub.claim(signal);
    if (claimed.kind === 'none') return { kind: 'idle' };
    if (claimed.kind === 'unavailable') {
      this.log(`${LOG_PREFIX} Claim unavailable (status=${claimed.status ?? 'network'}).`);
      return claimed;
    }
    if (claimed.kind === 'invalid') {
      this.log(
        `${LOG_PREFIX} Claim rejected: response is not a valid gfc.discord-delivery.v1 claim.`,
      );
      return { kind: 'invalid_claim' };
    }

    const { claim } = claimed;
    const operation = await this.process(claim);
    const label = `delivery=${claim.deliveryId} attempt=${claim.attempt} operation=${claim.operation}`;
    if (operation.kind === 'lease_lost') {
      this.log(`${LOG_PREFIX} ${label} lease lost at checkpoint; no Discord create was made.`);
      return { kind: 'lease_lost', deliveryId: claim.deliveryId };
    }

    const { result } = operation;
    const hub = await this.options.hub.reportResult(
      claim,
      result,
      operation.leaseExpiresAt ?? claim.leaseExpiresAt,
    );
    this.log(
      `${LOG_PREFIX} ${label} outcome=${result.outcome} code=${result.code} ` +
        `createAttempted=${result.createAttempted} hub=${hub.kind}`,
    );
    return { kind: 'reported', deliveryId: claim.deliveryId, result, hub: hub.kind };
  }

  private async process(claim: DeliveryClaim): Promise<OperationOutcome> {
    const context: OperationContext = {
      hub: this.options.hub,
      forum: this.options.forum,
      botUserId: this.options.botUserId,
      tags: this.options.tags,
      now: this.now,
    };
    try {
      switch (claim.operation) {
        case 'create':
          return await runCreate(context, claim);
        case 'reconcile':
          return await runReconcile(context, claim);
        case 'connect_existing':
          return await runConnect(context, claim);
      }
    } catch {
      // An unexpected adapter error after a checkpoint may hide a sent create: fail closed.
      const createAttempted = claim.operation === 'create';
      return {
        kind: 'report',
        result:
          claim.operation === 'connect_existing'
            ? outcome('retryable', 'adapter_error', false)
            : outcome('unknown', 'adapter_error', createAttempted),
      };
    }
  }
}
