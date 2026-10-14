import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { snowflakeSchema } from '../hubDelivery/contract';
import type { ForumPort, ThreadSnapshot } from '../hubDelivery/forumTypes';
export interface MessageEvidence {
  id: string;
  threadId: string;
  authorId: string;
  authorDisplayName: string;
  createdAt: string;
  editedAt: string | null;
  content: string;
  url: string;
  attachments: {
    id: string;
    name: string;
    url: string;
    size: number;
    contentType: string | null;
  }[];
}
export type ReadPort = Pick<
  ForumPort,
  'fetchForum' | 'fetchThread' | 'listActiveThreads' | 'listArchivedPage'
> & {
  fetchMessages(threadId: string, before: string, limit: number): Promise<MessageEvidence[]>;
};
export interface Grant {
  guildId: string;
  forumId: string;
  threads:
    | {
        kind: 'all';
      }
    | {
        kind: 'ids';
        ids: readonly string[];
      };
}
export type FailureStatus = 'denied' | 'unavailable' | 'rate_limited' | 'failed';
export class ReadFailure extends Error {
  constructor(
    readonly status: FailureStatus,
    readonly retryAfterMs: number | null = null,
  ) {
    super(status);
  }
}
const scopeSchema = z.object({ guildId: snowflakeSchema, forumId: snowflakeSchema }).strict();
const common = {
  scope: scopeSchema,
  maxPages: z.number().int().min(1).max(5),
  cursor: z.string().max(256000).optional(),
};
const requestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('lookup'),
      query: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('id'), id: snowflakeSchema }).strict(),
        z.object({ kind: z.literal('name'), text: z.string().trim().min(1).max(100) }).strict(),
      ]),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('history'),
      threadId: snowflakeSchema,
      since: z.string().datetime({ precision: 3 }),
      until: z.string().datetime({ precision: 3 }),
      maxMessages: z.number().int().min(1).max(500),
    })
    .strict(),
]);
export type ReadRequest = z.infer<typeof requestSchema>;
type WithoutCursor<T> = T extends unknown ? Omit<T, 'cursor'> : never;
type Requested = WithoutCursor<ReadRequest>;
export type ThreadEvidence = Pick<ThreadSnapshot, 'id' | 'name' | 'archived' | 'locked'> & {
  url: string;
};
export interface ReadResponse {
  contract: 'gfc.discord-read.v1';
  status: 'complete' | 'partial' | 'invalid_request' | FailureStatus;
  resolution: 'exact' | 'unique' | 'ambiguous' | 'empty' | 'incomplete' | null;
  threads: ThreadEvidence[];
  messages: MessageEvidence[];
  retryAfterMs: number | null;
  coverage: {
    requested: Requested | null;
    retrievedAt: string;
    oldest: string | null;
    newest: string | null;
    pagesRead: number;
    messagesRead: number;
    threadsRead: number;
    nextCursor: string | null;
    reason: string | null;
    intervalExhausted: boolean;
  };
}
type ScanState =
  | {
      kind: 'history';
      before: string;
    }
  | {
      kind: 'lookup';
      phase: 'active' | 'archive' | 'verify';
      before: string | null;
      boundary: string[];
      matches: ThreadEvidence[];
    };
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_THREADS = 1000;
/** Host supplies authenticated identity and current grants, never values from an assistant payload. */
export class ThreadReadService {
  private readonly cursorKey = Uint8Array.from(randomBytes(32));
  constructor(
    private readonly port: ReadPort,
    private readonly grantsFor: (caller: string) => readonly Grant[],
    private readonly now: () => number = Date.now,
  ) {}
  async read(caller: string, input: unknown): Promise<ReadResponse> {
    const retrievedAt = new Date(this.now()).toISOString();
    const result: ReadResponse = {
      contract: 'gfc.discord-read.v1',
      status: 'invalid_request',
      resolution: null,
      threads: [],
      messages: [],
      retryAfterMs: null,
      coverage: {
        requested: null,
        retrievedAt,
        oldest: null,
        newest: null,
        pagesRead: 0,
        messagesRead: 0,
        threadsRead: 0,
        nextCursor: null,
        reason: null,
        intervalExhausted: false,
      },
    };
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return result;
    const { cursor, ...request } = parsed.data;
    result.coverage.requested = request;
    result.resolution = request.kind === 'lookup' ? 'incomplete' : null;
    if (
      request.kind === 'history' &&
      (Date.parse(request.since) < 1420070400000 ||
        Date.parse(request.since) >= Date.parse(request.until) ||
        Date.parse(request.until) > this.now() ||
        Date.parse(request.until) - Date.parse(request.since) > MAX_WINDOW_MS)
    )
      return result;
    let grants: readonly Grant[];
    try {
      grants = this.grantsFor(caller).filter(
        (g) => g.guildId === request.scope.guildId && g.forumId === request.scope.forumId,
      );
    } catch {
      result.status = 'failed';
      result.coverage.reason = 'authority_unavailable';
      return result;
    }
    const permittedThreads = grants.some((g) => g.threads.kind === 'all')
      ? 'all'
      : [
          ...new Set(grants.flatMap((g) => (g.threads.kind === 'ids' ? [...g.threads.ids] : []))),
        ].sort();
    const allowedIds = new Set(permittedThreads === 'all' ? [] : permittedThreads);
    const allowed = (id: string) => permittedThreads === 'all' || allowedIds.has(id);
    if (
      !grants.length ||
      (request.kind === 'history' && !allowed(request.threadId)) ||
      (request.kind === 'lookup' && request.query.kind === 'id' && !allowed(request.query.id))
    ) {
      result.status = 'denied';
      return result;
    }
    const authorityHash = createHash('sha256')
      .update(JSON.stringify(permittedThreads))
      .digest('hex');
    const binding = JSON.stringify([caller, request, authorityHash]);
    let expires = this.now() + 15 * 60 * 1000;
    let state: ScanState =
      request.kind === 'history'
        ? {
            kind: 'history',
            before: String((BigInt(Date.parse(request.until)) - 1420070400000n) << 22n),
          }
        : { kind: 'lookup', phase: 'active', before: null, boundary: [], matches: [] };
    if (cursor) {
      const restored = this.restore(cursor, binding);
      if (!restored) {
        result.status = 'denied';
        return result;
      }
      state = restored.state;
      expires = restored.expires;
      if (state.kind === 'lookup' && state.matches.some((t) => !allowed(t.id))) {
        result.status = 'denied';
        return result;
      }
    }
    const inScope = (thread: ThreadSnapshot) =>
      thread.guildId === request.scope.guildId &&
      thread.parentId === request.scope.forumId &&
      thread.type === 11 &&
      allowed(thread.id);
    const stop = (reason: string, continuable = true) => {
      result.status = 'partial';
      result.coverage.reason = reason;
      if (continuable) result.coverage.nextCursor = this.save(binding, state, expires);
    };
    try {
      const forum = await this.port.fetchForum(request.scope.forumId);
      if (
        forum.id !== request.scope.forumId ||
        forum.guildId !== request.scope.guildId ||
        forum.type !== 15
      )
        throw new ReadFailure('denied');
      if (request.kind === 'history' && state.kind === 'history') {
        const thread = await this.port.fetchThread(request.threadId);
        if (thread.id !== request.threadId || !inScope(thread)) throw new ReadFailure('denied');
        const byId = new Map<string, MessageEvidence>();
        while (
          result.coverage.pagesRead < request.maxPages &&
          result.coverage.messagesRead < request.maxMessages
        ) {
          const limit = Math.min(100, request.maxMessages - result.coverage.messagesRead);
          const page = await this.port.fetchMessages(thread.id, state.before, limit);
          result.coverage.pagesRead++;
          if (
            page.length > limit ||
            page.some(
              (m) =>
                m.threadId !== thread.id ||
                !snowflakeSchema.safeParse(m.id).success ||
                !Number.isFinite(Date.parse(m.createdAt)),
            )
          )
            throw new ReadFailure('failed');
          result.coverage.messagesRead += page.length;
          let oldest = BigInt(state.before);
          let reachedStart = false;
          for (const m of page) {
            if (BigInt(m.id) >= BigInt(state.before)) continue;
            if (BigInt(m.id) < oldest) oldest = BigInt(m.id);
            if (Date.parse(m.createdAt) < Date.parse(request.since)) reachedStart = true;
            else if (Date.parse(m.createdAt) < Date.parse(request.until))
              byId.set(m.id, {
                ...m,
                url: `https://discord.com/channels/${request.scope.guildId}/${thread.id}/${m.id}`,
              });
          }
          result.messages = [...byId.values()].sort(
            (a, b) =>
              Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
              (BigInt(a.id) < BigInt(b.id) ? -1 : 1),
          );
          if (page.length && oldest === BigInt(state.before)) {
            stop('stalled_cursor', false);
            break;
          }
          state.before = String(oldest);
          if (reachedStart || page.length < limit) {
            result.status = 'complete';
            break;
          }
        }
        if (result.status === 'invalid_request')
          stop(
            result.coverage.messagesRead >= request.maxMessages ? 'message_limit' : 'page_limit',
          );
      } else if (request.kind === 'lookup' && state.kind === 'lookup') {
        if (request.query.kind === 'id') {
          const thread = await this.port.fetchThread(request.query.id);
          if (thread.id !== request.query.id || !inScope(thread)) throw new ReadFailure('denied');
          result.threads = [this.evidence(thread)];
          result.coverage.threadsRead = 1;
          result.status = 'complete';
          result.resolution = 'exact';
        } else {
          const query = request.query.text.toLowerCase();
          const consider = (threads: ThreadSnapshot[]) => {
            result.coverage.threadsRead += threads.length;
            if (threads.length > MAX_THREADS) throw new ReadFailure('failed');
            const matches = new Map(
              state.kind === 'lookup' ? state.matches.map((t) => [t.id, t]) : [],
            );
            for (const t of threads)
              if (inScope(t) && t.name.toLowerCase().includes(query))
                matches.set(t.id, this.evidence(t));
            if (state.kind === 'lookup') state.matches = [...matches.values()];
            result.threads = [...matches.values()]
              .slice(0, 100)
              .sort((a, b) => a.id.localeCompare(b.id));
          };
          result.threads = state.matches;
          while (result.coverage.pagesRead < request.maxPages) {
            if (state.phase !== 'archive') {
              const active = await this.port.listActiveThreads(request.scope.guildId);
              result.coverage.pagesRead++;
              consider(active);
              if (state.matches.length >= 100) {
                stop('match_limit', false);
                break;
              }
              if (state.phase === 'verify') {
                result.status = 'complete';
                break;
              }
              state.phase = 'archive';
            } else {
              const page = await this.port.listArchivedPage(request.scope.forumId, state.before);
              result.coverage.pagesRead++;
              if (
                page.threads.some(
                  (t) =>
                    t.guildId !== request.scope.guildId ||
                    t.parentId !== request.scope.forumId ||
                    t.type !== 11,
                )
              )
                throw new ReadFailure('failed');
              consider(page.threads);
              const times = page.threads.map((t) => Date.parse(t.archiveTimestamp ?? ''));
              const beforeMs = state.before === null ? Infinity : Date.parse(state.before);
              const ids = new Set(page.threads.map((t) => t.id));
              if (
                times.some(
                  (t, i) => !Number.isFinite(t) || t >= beforeMs || (i > 0 && t > times[i - 1]),
                ) ||
                state.boundary.some((id) => !ids.has(id)) ||
                page.hasMore === undefined
              ) {
                stop('archive_incomplete', false);
                break;
              }
              if (!page.hasMore) state.phase = 'verify';
              else {
                const oldest = times[times.length - 1];
                if (oldest === undefined || oldest >= beforeMs - 1) {
                  stop('stalled_cursor', false);
                  break;
                }
                state.before = new Date(oldest + 1).toISOString();
                state.boundary = page.threads
                  .filter((t) => Date.parse(t.archiveTimestamp ?? '') === oldest)
                  .map((t) => t.id);
              }
            }
            if (state.matches.length >= 100) {
              stop('match_limit', false);
              break;
            }
          }
          if (result.status === 'invalid_request') stop('page_limit');
          if (result.status === 'complete')
            result.resolution =
              result.threads.length > 1
                ? 'ambiguous'
                : result.threads.length === 1
                  ? 'unique'
                  : 'empty';
        }
      }
    } catch (error) {
      const failure = error instanceof ReadFailure ? error : new ReadFailure('failed');
      result.retryAfterMs = failure.retryAfterMs;
      result.coverage.reason = failure.status;
      if (failure.status === 'denied') {
        result.status = 'denied';
        result.messages = [];
        result.threads = [];
      } else if (result.coverage.pagesRead > 0) stop(failure.status);
      else result.status = failure.status;
    }
    result.coverage.oldest = result.messages[0]?.createdAt ?? null;
    result.coverage.newest = result.messages[result.messages.length - 1]?.createdAt ?? null;
    result.coverage.intervalExhausted = result.status === 'complete';
    return result;
  }
  private evidence(t: ThreadSnapshot): ThreadEvidence {
    if (t.name.length > 100) throw new ReadFailure('failed');
    return {
      id: t.id,
      name: t.name,
      archived: t.archived,
      locked: t.locked,
      url: `https://discord.com/channels/${t.guildId}/${t.id}`,
    };
  }
  private save(binding: string, state: ScanState, expires: number): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cursorKey, Uint8Array.from(nonce));
    const payload = Buffer.concat([
      Uint8Array.from(cipher.update(JSON.stringify({ binding, state, expires }), 'utf8')),
      Uint8Array.from(cipher.final()),
    ]);
    return [nonce, payload, cipher.getAuthTag()]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  private restore(cursor: string, binding: string): { state: ScanState; expires: number } | null {
    const [nonce, payload, tag, extra] = cursor.split('.');
    if (!nonce || !payload || !tag || extra !== undefined) return null;
    try {
      const iv = Buffer.from(nonce, 'base64url');
      const authTag = Buffer.from(tag, 'base64url');
      if (iv.length !== 12 || authTag.length !== 16) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.cursorKey, Uint8Array.from(iv));
      decipher.setAuthTag(Uint8Array.from(authTag));
      const plaintext = Buffer.concat([
        Uint8Array.from(decipher.update(Uint8Array.from(Buffer.from(payload, 'base64url')))),
        Uint8Array.from(decipher.final()),
      ]);
      // Authentication proves this instance produced the internal state; archive boundaries remain private.
      const saved = JSON.parse(plaintext.toString('utf8')) as {
        binding: string;
        state: ScanState;
        expires: number;
      };
      return saved.binding === binding && saved.expires > this.now() ? saved : null;
    } catch {
      return null;
    }
  }
}
