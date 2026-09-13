/**
 * Wire contract `gfc.discord-delivery.v1` between the Project Hub service API and
 * the GitFitBot delivery worker. Every body is a strict object: unknown fields are
 * rejected so a drifting Hub fails closed instead of steering Discord writes.
 *
 * Shared fixtures live in tests/fixtures/discord-delivery.v1 and must stay
 * byte-identical to the Hub's copy.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const DISCORD_DELIVERY_CONTRACT = 'gfc.discord-delivery.v1';
export const CONTRACT_HEADER = 'X-GFC-Contract';
export const MAX_SERVICE_BODY_BYTES = 16 * 1024;

export const snowflakeSchema = z.string().regex(/^\d{17,20}$/);
const deliveryIdSchema = z
  .string()
  .regex(/^dlv_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const deliveryRefSchema = z.string().regex(/^gfcp-[a-z2-7]{26}$/);
const leaseTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const timestampSchema = z.string().datetime();
const attemptSchema = z.number().int().min(1).max(1_000_000);
const codeSchema = z.string().regex(/^[a-z_]{1,64}$/);

// Discord limits (name ≤100, content ≤2000) are enforced by the create operation so a
// violation is reported as `content_invalid` instead of an unreportable parse failure.
export const postSchema = z
  .object({ threadName: z.string().max(400), content: z.string().max(8000) })
  .strict();

const targetSchema = z.object({ guildId: snowflakeSchema, forumId: snowflakeSchema }).strict();

const claimBase = {
  contract: z.literal(DISCORD_DELIVERY_CONTRACT),
  deliveryId: deliveryIdSchema,
  deliveryRef: deliveryRefSchema,
  attempt: attemptSchema,
  leaseToken: leaseTokenSchema,
  leaseExpiresAt: timestampSchema,
  // An assertion only: the worker compares it with pinned constants and never uses it as a target.
  target: targetSchema,
  snapshotSha256: sha256Schema,
};

export const createClaimSchema = z
  .object({
    ...claimBase,
    operation: z.literal('create'),
    post: postSchema,
    requestedThreadId: z.null(),
    owner: z.null(),
    createWindow: z.null(),
  })
  .strict();

export const reconcileClaimSchema = z
  .object({
    ...claimBase,
    operation: z.literal('reconcile'),
    post: postSchema,
    requestedThreadId: z.null(),
    owner: z.null(),
    createWindow: z
      .object({ start: timestampSchema, lastCreateStartedAt: timestampSchema })
      .strict(),
  })
  .strict();

export const connectClaimSchema = z
  .object({
    ...claimBase,
    operation: z.literal('connect_existing'),
    post: z.null(),
    requestedThreadId: snowflakeSchema,
    owner: z.object({ discordUserId: snowflakeSchema }).strict(),
    createWindow: z.null(),
  })
  .strict();

export const claimSchema = z.discriminatedUnion('operation', [
  createClaimSchema,
  reconcileClaimSchema,
  connectClaimSchema,
]);

export const checkpointRequestSchema = z
  .object({
    contract: z.literal(DISCORD_DELIVERY_CONTRACT),
    attempt: attemptSchema,
    leaseToken: leaseTokenSchema,
    phase: z.literal('create_started'),
  })
  .strict();

export const checkpointResponseSchema = z.object({ leaseExpiresAt: timestampSchema }).strict();

const resultFields = {
  outcome: z.enum(['linked', 'retryable', 'blocked', 'terminal', 'unknown', 'conflict', 'absent']),
  code: codeSchema,
  createAttempted: z.boolean(),
  retryAfterMs: z.number().int().min(0).max(86_400_000).optional(),
  discord: z
    .object({
      guildId: snowflakeSchema,
      forumId: snowflakeSchema,
      threadId: snowflakeSchema,
      starterMessageId: snowflakeSchema,
      threadOwnerId: snowflakeSchema,
      archived: z.boolean(),
      locked: z.boolean(),
      name: z.string().min(1).max(100),
    })
    .strict()
    .optional(),
  resolution: z.enum(['created', 'reconciled', 'connected']).optional(),
  candidateThreadIds: z.array(snowflakeSchema).min(1).max(10).optional(),
  scan: z
    .object({ activeComplete: z.boolean(), archivedComplete: z.boolean() })
    .strict()
    .optional(),
};

function refineResult(
  value: { outcome: string; discord?: unknown; resolution?: unknown; candidateThreadIds?: unknown },
  context: z.RefinementCtx,
): void {
  const linked = value.outcome === 'linked';
  if (linked !== (value.discord !== undefined) || linked !== (value.resolution !== undefined))
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'discord and resolution are required for linked results only',
    });
  if (value.candidateThreadIds !== undefined && value.outcome !== 'conflict')
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'candidateThreadIds are only valid for conflict results',
    });
}

export const deliveryResultSchema = z.object(resultFields).strict().superRefine(refineResult);

export const resultRequestSchema = z
  .object({
    contract: z.literal(DISCORD_DELIVERY_CONTRACT),
    attempt: attemptSchema,
    leaseToken: leaseTokenSchema,
    snapshotSha256: sha256Schema,
    ...resultFields,
  })
  .strict()
  .superRefine(refineResult);

export const resultResponseSchema = z
  .object({ state: codeSchema, idempotent: z.boolean() })
  .strict();

export type DeliveryPost = z.infer<typeof postSchema>;
export type CreateClaim = z.infer<typeof createClaimSchema>;
export type ReconcileClaim = z.infer<typeof reconcileClaimSchema>;
export type ConnectClaim = z.infer<typeof connectClaimSchema>;
export type DeliveryClaim = z.infer<typeof claimSchema>;
export type DeliveryResult = z.infer<typeof deliveryResultSchema>;

/** JSON with object keys sorted (UTF-16 code-unit order) at every depth and no whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** sha256(canonicalJson(post)) as lowercase hex — the approved-snapshot binding. */
export function computeSnapshotSha256(post: DeliveryPost): string {
  return createHash('sha256').update(canonicalJson(post), 'utf8').digest('hex');
}
