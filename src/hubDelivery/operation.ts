/**
 * Shared pieces of the create / reconcile / connect operations: pinned-target checks,
 * forum validation, and the Discord condition → typed outcome mapping.
 */

import { ChannelFlags, ChannelType } from 'discord.js';
import { GFC_GUILD_ID, GFC_PROJECTS_FORUM_ID } from '../utils/constants';
import type { TagConfig } from './config';
import type { DeliveryClaim, DeliveryPost, DeliveryResult } from './contract';
import {
  ForumPortError,
  type ForumFailure,
  type ForumPort,
  type ForumSnapshot,
  type ThreadSnapshot,
} from './forumPort';
import type { HubClient } from './hubClient';

// discord-api-types: thread name "1-100 character", message content "up to 2000 characters".
const MAX_THREAD_NAME_LENGTH = 100;
const MAX_CONTENT_LENGTH = 2000;

export interface OperationContext {
  hub: HubClient;
  forum: ForumPort;
  botUserId: string;
  tags: TagConfig;
  now: () => number;
}

export type OperationOutcome =
  | { kind: 'report'; result: DeliveryResult; leaseExpiresAt?: string }
  | { kind: 'lease_lost' };

export function report(result: DeliveryResult, leaseExpiresAt?: string): OperationOutcome {
  return { kind: 'report', result, leaseExpiresAt };
}

export function outcome(
  kind: DeliveryResult['outcome'],
  code: string,
  createAttempted: boolean,
  extra: Partial<DeliveryResult> = {},
): DeliveryResult {
  return { outcome: kind, code, createAttempted, ...extra };
}

export function linkedResult(
  thread: ThreadSnapshot,
  resolution: 'created' | 'reconciled' | 'connected',
  createAttempted: boolean,
  extra: Partial<DeliveryResult> = {},
): DeliveryResult {
  return outcome('linked', resolution, createAttempted, {
    resolution,
    discord: {
      guildId: GFC_GUILD_ID,
      forumId: GFC_PROJECTS_FORUM_ID,
      threadId: thread.id,
      // A forum thread's starter message ID equals the thread ID (platform assumption A1).
      starterMessageId: thread.id,
      threadOwnerId: thread.ownerId,
      archived: thread.archived,
      locked: thread.locked,
      name: thread.name,
    },
    ...extra,
  });
}

/** Unexpected (non-port) errors are treated as "the request may have been sent". */
export function failureOf(error: unknown): ForumFailure {
  return error instanceof ForumPortError ? error.failure : { kind: 'network', requestSent: true };
}

/** The claim's target is an assertion checked against pinned constants, never a destination. */
export function targetMatches(claim: DeliveryClaim): boolean {
  return claim.target.guildId === GFC_GUILD_ID && claim.target.forumId === GFC_PROJECTS_FORUM_ID;
}

export function isValidPost(post: DeliveryPost, deliveryRef: string): boolean {
  const name = post.threadName;
  if (
    name.length < 1 ||
    name.length > MAX_THREAD_NAME_LENGTH ||
    name !== name.trim() ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/.test(name)
  )
    return false;
  if (post.content.length < 1 || post.content.length > MAX_CONTENT_LENGTH) return false;
  return countMarkerLines(post.content, deliveryRef) === 1;
}

export function countMarkerLines(content: string, deliveryRef: string): number {
  const marker = `Hub reference: ${deliveryRef}`;
  return content.split('\n').filter((line) => line === marker).length;
}

/** Discord read failures (pre-flight or connect). No create is involved. */
export function mapReadFailure(failure: ForumFailure): DeliveryResult {
  switch (failure.kind) {
    case 'api':
      if (failure.code === 50001) return outcome('blocked', 'missing_access', false);
      if (failure.code === 50013 || failure.status === 403)
        return outcome('blocked', 'missing_permissions', false);
      if (failure.code === 10003 || failure.status === 404)
        return outcome('blocked', 'forum_unavailable', false);
      if (failure.status === 401) return outcome('blocked', 'discord_unauthorized', false);
      if (failure.status === 429) return outcome('retryable', 'discord_rate_limited', false);
      return outcome('blocked', 'discord_client_error', false);
    case 'rate_limited':
      return outcome('retryable', 'discord_rate_limited', false, {
        retryAfterMs: failure.retryAfterMs,
      });
    default:
      return outcome('retryable', 'discord_unreachable', false);
  }
}

/**
 * Failures of the single create call. Anything that may have reached Discord is `unknown`
 * with `createAttempted: true`, so the Hub reconciles instead of re-creating.
 */
export function mapCreateFailure(failure: ForumFailure): DeliveryResult {
  switch (failure.kind) {
    case 'rate_limited':
      // Only a limiter rejection before dispatch is proven unsent. A received 429 relies on
      // Discord not processing rate-limited requests, which no installed source states (A3).
      return failure.requestSent
        ? outcome('unknown', 'discord_rate_limited_unverified', true)
        : outcome('retryable', 'discord_rate_limited', false, {
            retryAfterMs: failure.retryAfterMs,
          });
    case 'network':
      return failure.requestSent
        ? outcome('unknown', 'discord_response_lost', true)
        : outcome('retryable', 'discord_unreachable', false);
    case 'timeout':
    case 'malformed_response':
      return outcome('unknown', 'discord_response_lost', true);
    case 'server_error':
      return outcome('unknown', 'discord_server_error', true);
    case 'api':
      if (failure.status === 429)
        return outcome('unknown', 'discord_rate_limited_unverified', true);
      if (failure.status >= 500) return outcome('unknown', 'discord_server_error', true);
      if (failure.code === 50001) return outcome('blocked', 'missing_access', false);
      if (failure.code === 50013 || failure.status === 403)
        return outcome('blocked', 'missing_permissions', false);
      if (failure.code === 40067) return outcome('blocked', 'tag_required_unconfigured', false);
      if (failure.code === 10003 || failure.status === 404)
        return outcome('blocked', 'forum_unavailable', false);
      if (failure.status === 401) return outcome('blocked', 'discord_unauthorized', false);
      if (failure.status === 400) return outcome('terminal', 'content_invalid', false);
      return outcome('blocked', 'discord_client_error', false);
  }
}

/** The fetched forum must be the pinned forum, in the pinned guild, of forum type. */
export function validateForum(forum: ForumSnapshot): DeliveryResult | null {
  if (forum.id !== GFC_PROJECTS_FORUM_ID || forum.guildId !== GFC_GUILD_ID)
    return outcome('blocked', 'forum_unavailable', false);
  if (forum.type !== ChannelType.GuildForum) return outcome('blocked', 'forum_wrong_type', false);
  return null;
}

export function validateTags(forum: ForumSnapshot, tags: TagConfig): DeliveryResult | null {
  if (!tags.ok) return outcome('blocked', 'tag_unavailable', false);
  for (const id of tags.ids) {
    const tag = forum.availableTags.find((candidate) => candidate.id === id);
    if (!tag) return outcome('blocked', 'tag_unavailable', false);
    if (tag.moderated) return outcome('blocked', 'tag_moderated', false);
  }
  if ((forum.flags & ChannelFlags.RequireTag) !== 0 && tags.ids.length === 0)
    return outcome('blocked', 'tag_required_unconfigured', false);
  return null;
}
