/**
 * Reconcile never creates. It looks for bot-owned public threads in the pinned forum, created
 * inside the Hub's create window, whose starter message carries exactly one
 * `Hub reference: <deliveryRef>` line.
 */

import { ChannelType } from 'discord.js';
import { GFC_GUILD_ID, GFC_PROJECTS_FORUM_ID } from '../utils/constants';
import { computeSnapshotSha256, type ReconcileClaim } from './contract';
import type { ForumSnapshot, ThreadSnapshot } from './forumPort';
import {
  countMarkerLines,
  failureOf,
  isValidPost,
  linkedResult,
  mapReadFailure,
  outcome,
  report,
  targetMatches,
  validateForum,
  type OperationContext,
  type OperationOutcome,
} from './operation';

export const RECONCILE_SETTLE_MS = 120_000;
const CLOCK_SKEW_MS = 60_000;
const MAX_ARCHIVED_PAGES = 50;
const MAX_CANDIDATES = 50;
const MAX_REPORTED_CANDIDATES = 10;
const DISCORD_EPOCH_MS = 1420070400000n;

function snowflakeTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH_MS);
}

export async function runReconcile(
  context: OperationContext,
  claim: ReconcileClaim,
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
    const blocked = mapReadFailure(failureOf(error));
    return report(outcome('unknown', `reconcile_blocked_${blocked.code}`, false));
  }
  const problem = validateForum(forum);
  if (problem) return report(outcome('unknown', `reconcile_blocked_${problem.code}`, false));

  const now = context.now();
  const windowStart = Date.parse(claim.createWindow.start);
  const candidates = new Map<string, ThreadSnapshot>();
  const consider = (thread: ThreadSnapshot) => {
    const createdAt = snowflakeTimestamp(thread.id);
    if (
      thread.guildId === GFC_GUILD_ID &&
      thread.parentId === GFC_PROJECTS_FORUM_ID &&
      thread.ownerId === context.botUserId &&
      createdAt >= windowStart &&
      createdAt <= now + CLOCK_SKEW_MS
    )
      candidates.set(thread.id, thread);
  };

  const scanActive = async (): Promise<boolean> => {
    try {
      (await context.forum.listActiveThreads(GFC_GUILD_ID)).forEach(consider);
      return true;
    } catch {
      return false;
    }
  };

  const activeCompleteBefore = await scanActive();
  const archivedComplete = await scanArchived(context, consider, windowStart);
  // Active and archived listings are not one snapshot. Re-scan active threads so a thread
  // unarchived while the archived pages were read cannot disappear between the two sets.
  const activeCompleteAfter = await scanActive();
  const scan = { activeComplete: activeCompleteBefore && activeCompleteAfter, archivedComplete };

  const matches: ThreadSnapshot[] = [];
  const unverifiable: string[] = [];
  let startersComplete = candidates.size <= MAX_CANDIDATES;
  for (const thread of [...candidates.values()].slice(0, MAX_CANDIDATES)) {
    try {
      const starter = await context.forum.fetchStarterMessage(thread.id);
      const markers = countMarkerLines(starter.content, claim.deliveryRef);
      // A non-public thread type is inconsistent with a forum post: it can never count as a match.
      if (
        thread.type === ChannelType.PublicThread &&
        starter.id === thread.id &&
        starter.authorId === context.botUserId &&
        markers === 1
      )
        matches.push(thread);
      else if (starter.content.includes(claim.deliveryRef)) unverifiable.push(thread.id);
    } catch (error) {
      const failure = failureOf(error);
      // A definitive refusal (e.g. 10008 Unknown Message) cannot be retried into an answer.
      if (failure.kind === 'api' && failure.status < 500 && failure.status !== 429)
        unverifiable.push(thread.id);
      else startersComplete = false;
    }
  }

  const candidateThreadIds = [...matches.map((thread) => thread.id), ...unverifiable].slice(
    0,
    MAX_REPORTED_CANDIDATES,
  );
  if (matches.length >= 2)
    return report(
      outcome('conflict', 'reconcile_multiple_matches', false, { candidateThreadIds, scan }),
    );
  if (unverifiable.length > 0)
    return report(
      outcome('conflict', 'reconcile_unverifiable', false, { candidateThreadIds, scan }),
    );

  const complete = scan.activeComplete && archivedComplete && startersComplete;
  if (matches.length === 1 && complete)
    return report(linkedResult(matches[0], 'reconciled', false, { scan }));
  if (
    matches.length === 0 &&
    complete &&
    now - Date.parse(claim.createWindow.lastCreateStartedAt) >= RECONCILE_SETTLE_MS
  )
    return report(outcome('absent', 'reconcile_absent', false, { scan }));
  return report(outcome('unknown', 'reconcile_incomplete', false, { scan }));
}

/**
 * Pages public archived threads until `has_more` is false or a validated page crosses strictly
 * before the create-window start. A thread cannot be archived before it is created, so archive
 * timestamps before that bound cannot contain another candidate.
 *
 * `before` is an exclusive archive-timestamp cursor, and archive timestamps are not unique, so
 * advancing to the oldest timestamp on a page could skip unseen threads archived in that same
 * millisecond. Each cursor is therefore one millisecond past the page's oldest timestamp, and
 * the boundary counts as covered only when the next page returns every boundary thread already
 * seen and then either a strictly older thread or `has_more: false`.
 *
 * Returns false (incomplete) on any error, a missing `has_more`, a page that is not strictly
 * older than the cursor and sorted newest-first, a page that does not re-return the previous
 * boundary, a page that cannot advance past its boundary, an empty page that claims more, or
 * the page cap.
 */
async function scanArchived(
  context: OperationContext,
  consider: (thread: ThreadSnapshot) => void,
  windowStart: number,
): Promise<boolean> {
  let before: string | null = null;
  let boundary: { ms: number; threadIds: string[] } | null = null;
  for (let page = 0; page < MAX_ARCHIVED_PAGES; page += 1) {
    let result;
    try {
      result = await context.forum.listArchivedPage(GFC_PROJECTS_FORUM_ID, before);
    } catch {
      return false;
    }
    result.threads.forEach(consider);

    const cursorMs = before === null ? Number.POSITIVE_INFINITY : Date.parse(before);
    let previousMs = Number.POSITIVE_INFINITY;
    for (const thread of result.threads) {
      const archivedMs = thread.archiveTimestamp ? Date.parse(thread.archiveTimestamp) : Number.NaN;
      if (!Number.isFinite(archivedMs) || archivedMs >= cursorMs || archivedMs > previousMs)
        return false;
      previousMs = archivedMs;
    }

    const returnedIds = new Set(result.threads.map((thread) => thread.id));
    if (boundary && !boundary.threadIds.every((id) => returnedIds.has(id))) return false;

    if (result.hasMore === undefined) return false;
    if (!result.hasMore) return true;
    if (result.threads.length === 0) return false;
    // A page made only of threads tied at the previous boundary cannot advance without skipping.
    if (boundary && previousMs >= boundary.ms) return false;
    const oldestMs = previousMs;
    // Equality is not sufficient: unseen threads may share the boundary timestamp at window start.
    if (oldestMs < windowStart) return true;
    boundary = {
      ms: oldestMs,
      threadIds: result.threads
        .filter((thread) => Date.parse(thread.archiveTimestamp ?? '') === oldestMs)
        .map((thread) => thread.id),
    };
    before = new Date(oldestMs + 1).toISOString();
  }
  return false;
}
