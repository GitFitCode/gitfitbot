/**
 * Outbound client for the Hub service API. The bot never listens: it claims work,
 * checkpoints before a create, and reports results. Redirects are refused, bodies are
 * capped, and only checkpoint/result delivery is retried (claims are the poll loop).
 */

import type { z } from 'zod';
import {
  checkpointResponseSchema,
  claimSchema,
  CONTRACT_HEADER,
  DISCORD_DELIVERY_CONTRACT,
  MAX_SERVICE_BODY_BYTES,
  resultRequestSchema,
  resultResponseSchema,
  type DeliveryClaim,
  type DeliveryResult,
} from './contract';

const SERVICE_PREFIX = '/api/service/discord-delivery/v1';
export const HUB_REQUEST_TIMEOUT_MS = 15_000;
const CHECKPOINT_ATTEMPTS = 3;
const RESULT_ATTEMPTS = 6;
// Keep retrying a result a little past lease expiry; the Hub accepts late evidence.
const RESULT_GRACE_MS = 60_000;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 30_000;

export type ClaimResponse =
  | { kind: 'work'; claim: DeliveryClaim }
  | { kind: 'none' }
  | { kind: 'unavailable'; status: number | null }
  | { kind: 'invalid' };

export type CheckpointResponse =
  | { kind: 'ok'; leaseExpiresAt: string }
  | { kind: 'lease_lost' }
  | { kind: 'failed' };

export type ResultResponse =
  | { kind: 'ok'; state: string; idempotent: boolean }
  | { kind: 'lease_lost' }
  | { kind: 'rejected'; status: number | null }
  | { kind: 'failed' };

export interface HubClientOptions {
  origin: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

type SendOutcome = { kind: 'response'; status: number; body: string | null } | { kind: 'network' };

async function readCapped(response: Response, limit: number): Promise<string | null> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseBody<T>(
  body: string | null,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T | undefined {
  if (body === null) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export class HubClient {
  private readonly origin: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(options: HubClientOptions) {
    this.origin = options.origin;
    this.token = options.token;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? HUB_REQUEST_TIMEOUT_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  async claim(signal?: AbortSignal): Promise<ClaimResponse> {
    const response = await this.send(`${SERVICE_PREFIX}/claim`, '{}', signal);
    if (response.kind === 'network') return { kind: 'unavailable', status: null };
    if (response.status === 204) return { kind: 'none' };
    if (response.status !== 200) return { kind: 'unavailable', status: response.status };
    const claim = parseBody(response.body, claimSchema);
    return claim ? { kind: 'work', claim } : { kind: 'invalid' };
  }

  /** Must return `ok` before any Discord create; `lease_lost` forbids the create outright. */
  async checkpoint(claim: DeliveryClaim): Promise<CheckpointResponse> {
    const body = JSON.stringify({
      contract: DISCORD_DELIVERY_CONTRACT,
      attempt: claim.attempt,
      leaseToken: claim.leaseToken,
      phase: 'create_started',
    });
    for (let attempt = 1; attempt <= CHECKPOINT_ATTEMPTS; attempt += 1) {
      if (attempt > 1) await this.sleep(this.backoff(attempt - 1));
      const response = await this.send(this.deliveryPath(claim, 'checkpoint'), body);
      if (response.kind === 'network' || response.status >= 500) continue;
      if (response.status === 409) return { kind: 'lease_lost' };
      if (response.status !== 200) return { kind: 'failed' };
      const parsed = parseBody(response.body, checkpointResponseSchema);
      return parsed ? { kind: 'ok', leaseExpiresAt: parsed.leaseExpiresAt } : { kind: 'failed' };
    }
    return { kind: 'failed' };
  }

  /** Retries transient failures with the byte-identical body until attempts or the lease grace run out. */
  async reportResult(
    claim: DeliveryClaim,
    result: DeliveryResult,
    leaseExpiresAt: string,
  ): Promise<ResultResponse> {
    const request = {
      contract: DISCORD_DELIVERY_CONTRACT,
      attempt: claim.attempt,
      leaseToken: claim.leaseToken,
      snapshotSha256: claim.snapshotSha256,
      ...result,
    };
    if (!resultRequestSchema.safeParse(request).success) return { kind: 'rejected', status: null };
    const body = JSON.stringify(request);
    const deadline = Date.parse(leaseExpiresAt) + RESULT_GRACE_MS;
    for (let attempt = 1; attempt <= RESULT_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        if (this.now() > deadline) break;
        await this.sleep(this.backoff(attempt - 1));
      }
      // Checked again right before every send, so neither a long operation nor a backoff can
      // carry a request past the grace window.
      if (this.now() > deadline) break;
      const response = await this.send(this.deliveryPath(claim, 'result'), body);
      if (response.kind === 'network' || response.status === 429 || response.status >= 500)
        continue;
      if (response.status === 409) return { kind: 'lease_lost' };
      if (response.status !== 200) return { kind: 'rejected', status: response.status };
      const parsed = parseBody(response.body, resultResponseSchema);
      return parsed ? { kind: 'ok', ...parsed } : { kind: 'failed' };
    }
    return { kind: 'failed' };
  }

  private deliveryPath(claim: DeliveryClaim, action: 'checkpoint' | 'result'): string {
    return `${SERVICE_PREFIX}/deliveries/${encodeURIComponent(claim.deliveryId)}/${action}`;
  }

  private backoff(retry: number): number {
    const base = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (retry - 1));
    return Math.round(base * (0.8 + 0.4 * this.random()));
  }

  private async send(path: string, body: string, signal?: AbortSignal): Promise<SendOutcome> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    try {
      const response = await this.fetchImpl(new URL(path, this.origin).toString(), {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          [CONTRACT_HEADER]: DISCORD_DELIVERY_CONTRACT,
        },
        body,
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
      return {
        kind: 'response',
        status: response.status,
        body: await readCapped(response, MAX_SERVICE_BODY_BYTES),
      };
    } catch {
      return { kind: 'network' };
    }
  }
}
