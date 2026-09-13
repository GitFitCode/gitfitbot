import { ChannelType } from 'discord.js';
import { GFC_GUILD_ID, GFC_PROJECTS_FORUM_ID } from '../utils/constants';
import { computeSnapshotSha256, type CreateClaim, type DeliveryResult } from './contract';
import {
  buildCreateThreadBody,
  DISCORD_CREATE_TIMEOUT_MS,
  type CreatedThread,
  type ForumSnapshot,
} from './forumPort';
import {
  failureOf,
  isValidPost,
  linkedResult,
  mapCreateFailure,
  mapReadFailure,
  outcome,
  report,
  targetMatches,
  validateForum,
  validateTags,
  type OperationContext,
  type OperationOutcome,
} from './operation';

// Never start a create that could outlive the lease the checkpoint just renewed.
const CREATE_LEASE_MARGIN_MS = DISCORD_CREATE_TIMEOUT_MS + 5_000;

export async function runCreate(
  context: OperationContext,
  claim: CreateClaim,
): Promise<OperationOutcome> {
  if (!targetMatches(claim)) return report(outcome('terminal', 'target_mismatch', false));
  if (computeSnapshotSha256(claim.post) !== claim.snapshotSha256)
    return report(outcome('terminal', 'snapshot_mismatch', false));
  if (!isValidPost(claim.post, claim.deliveryRef))
    return report(outcome('terminal', 'content_invalid', false));

  let forum: ForumSnapshot;
  try {
    forum = await context.forum.fetchForum(GFC_PROJECTS_FORUM_ID);
  } catch (error) {
    return report(mapReadFailure(failureOf(error)));
  }
  const problem = validateForum(forum) ?? validateTags(forum, context.tags);
  if (problem) return report(problem);
  const tagIds = context.tags.ok ? context.tags.ids : [];

  const checkpoint = await context.hub.checkpoint(claim);
  if (checkpoint.kind === 'lease_lost') return { kind: 'lease_lost' };
  if (checkpoint.kind === 'failed')
    return report(outcome('retryable', 'hub_checkpoint_failed', false));
  const { leaseExpiresAt } = checkpoint;
  if (Date.parse(leaseExpiresAt) - context.now() < CREATE_LEASE_MARGIN_MS)
    return report(outcome('retryable', 'lease_expiring', false), leaseExpiresAt);

  let created: CreatedThread;
  try {
    created = await context.forum.createThread(
      GFC_PROJECTS_FORUM_ID,
      buildCreateThreadBody(claim.post, tagIds),
    );
  } catch (error) {
    return report(mapCreateFailure(failureOf(error)), leaseExpiresAt);
  }
  return report(await verifyCreated(context, claim, created), leaseExpiresAt);
}

/** A 2xx only links when the thread and its starter message prove they are exactly what was sent. */
async function verifyCreated(
  context: OperationContext,
  claim: CreateClaim,
  created: CreatedThread,
): Promise<DeliveryResult> {
  const lost = outcome('unknown', 'discord_response_lost', true);
  const { thread } = created;
  if (
    thread.type !== ChannelType.PublicThread ||
    thread.guildId !== GFC_GUILD_ID ||
    thread.parentId !== GFC_PROJECTS_FORUM_ID ||
    thread.ownerId !== context.botUserId ||
    // The snapshot hash binds the visible title too: a renamed thread is not the approved post.
    thread.name !== claim.post.threadName
  )
    return lost;

  let starter = created.starterMessage;
  if (!starter) {
    try {
      starter = await context.forum.fetchStarterMessage(thread.id);
    } catch {
      return lost;
    }
  }
  if (
    starter.id !== thread.id ||
    starter.authorId !== context.botUserId ||
    starter.content !== claim.post.content
  )
    return lost;
  return linkedResult(thread, 'created', true);
}
