import { ChannelType } from 'discord.js';
import { GFC_GUILD_ID, GFC_PROJECTS_FORUM_ID } from '../utils/constants';
import type { ConnectClaim } from './contract';
import type { ForumSnapshot, ThreadSnapshot } from './forumPort';
import {
  failureOf,
  linkedResult,
  mapReadFailure,
  outcome,
  report,
  targetMatches,
  validateForum,
  type OperationContext,
  type OperationOutcome,
} from './operation';

/**
 * Links a member's existing post. The thread must sit in the pinned forum and be owned by
 * the Hub-supplied owner; bot-owned threads are never connectable, so a thread the bot
 * created for one project cannot be claimed by another.
 */
export async function runConnect(
  context: OperationContext,
  claim: ConnectClaim,
): Promise<OperationOutcome> {
  if (!targetMatches(claim)) return report(outcome('terminal', 'target_mismatch', false));

  let forum: ForumSnapshot;
  try {
    forum = await context.forum.fetchForum(GFC_PROJECTS_FORUM_ID);
  } catch (error) {
    return report(mapReadFailure(failureOf(error)));
  }
  const problem = validateForum(forum);
  if (problem) return report(problem);

  let thread: ThreadSnapshot;
  try {
    thread = await context.forum.fetchThread(claim.requestedThreadId);
  } catch (error) {
    const failure = failureOf(error);
    if (failure.kind === 'api' && (failure.code === 10003 || failure.status === 404))
      return report(outcome('terminal', 'thread_not_found', false));
    return report(mapReadFailure(failure));
  }

  if (
    thread.id !== claim.requestedThreadId ||
    thread.guildId !== GFC_GUILD_ID ||
    thread.parentId !== GFC_PROJECTS_FORUM_ID ||
    thread.type !== ChannelType.PublicThread
  )
    return report(outcome('terminal', 'thread_wrong_parent', false));
  if (thread.ownerId === context.botUserId || thread.ownerId !== claim.owner.discordUserId)
    return report(outcome('conflict', 'thread_owner_mismatch', false));

  return report(linkedResult(thread, 'connected', false));
}
