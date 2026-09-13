import {
  ForumPortError,
  type CreatedThread,
  type CreateThreadBody,
  type ForumFailure,
  type ForumPort,
  type ForumSnapshot,
  type StarterMessage,
  type ThreadSnapshot,
} from '../../src/hubDelivery/forumPort';
import { GFC_GUILD_ID, GFC_PROJECTS_FORUM_ID } from '../../src/utils/constants';

export const NOW = Date.parse('2026-09-12T23:00:00.000Z');
export const LEASE_EXPIRES_AT = '2026-09-12T23:05:00.000Z';
export const BOT_USER_ID = '987654321098765432';
export const OWNER_ID = '123456789012345678';
export const OTHER_USER_ID = '223456789012345678';
export const TAG_OPEN = '444444444444444444';
export const TAG_MODERATED = '555555555555555555';
export const TAG_MISSING = '666666666666666666';
export const TOKEN = 'dGVzdC1vbmx5LXN5bnRoZXRpYy1zZXJ2aWNlLXRva2VuLXZhbHVl';

const DISCORD_EPOCH = 1420070400000n;
let sequence = 0n;

/** Builds a snowflake whose embedded timestamp is `ms`. */
export function snowflakeAt(ms: number): string {
  sequence = (sequence + 1n) % 4096n;
  return (((BigInt(ms) - DISCORD_EPOCH) << 22n) | sequence).toString(10);
}

export function apiError(status: number, code: number | null): ForumPortError {
  return new ForumPortError({ kind: 'api', status, code });
}

export function failure(value: ForumFailure): ForumPortError {
  return new ForumPortError(value);
}

type Method =
  | 'fetchForum'
  | 'fetchThread'
  | 'fetchStarterMessage'
  | 'listActiveThreads'
  | 'listArchivedPage'
  | 'createThread';

export type CreateMode =
  | 'ok'
  | 'accept_then_timeout'
  | 'malformed'
  | 'wrong_parent'
  | 'altered_content'
  | 'no_starter_in_response';

interface StoredThread {
  thread: ThreadSnapshot;
  starter: StarterMessage | null;
}

export interface AddThreadInput {
  createdAt?: number;
  ownerId?: string;
  authorId?: string;
  content?: string;
  name?: string;
  archived?: boolean;
  archiveTimestamp?: string;
  locked?: boolean;
  parentId?: string;
  guildId?: string;
  starter?: boolean;
  type?: number;
}

/** In-memory ForumPort. Records every call; never touches the network. */
export class FakeForumPort implements ForumPort {
  readonly calls: { method: Method; args: unknown[] }[] = [];
  readonly threads = new Map<string, StoredThread>();
  readonly failures: Partial<Record<Method, ForumPortError[]>> = {};
  forum: ForumSnapshot = {
    id: GFC_PROJECTS_FORUM_ID,
    guildId: GFC_GUILD_ID,
    type: 15,
    flags: 0,
    availableTags: [
      { id: TAG_OPEN, moderated: false },
      { id: TAG_MODERATED, moderated: true },
    ],
  };
  createMode: CreateMode = 'ok';
  archivedPageSize = 2;
  omitHasMore = false;
  unsortedArchivedPages = false;

  constructor(private readonly options: { events?: string[]; now?: () => number } = {}) {}

  fail(method: Method, error: ForumPortError): void {
    (this.failures[method] ??= []).push(error);
  }

  callsTo(method: Method): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }

  addThread(input: AddThreadInput = {}): ThreadSnapshot {
    const createdAt = input.createdAt ?? this.now();
    const id = snowflakeAt(createdAt);
    const thread: ThreadSnapshot = {
      id,
      guildId: input.guildId ?? GFC_GUILD_ID,
      parentId: input.parentId ?? GFC_PROJECTS_FORUM_ID,
      type: input.type ?? 11,
      ownerId: input.ownerId ?? BOT_USER_ID,
      name: input.name ?? 'Synthetic thread',
      archived: input.archived ?? false,
      locked: input.locked ?? false,
      archiveTimestamp: input.archiveTimestamp ?? new Date(createdAt + 60_000).toISOString(),
    };
    this.threads.set(id, {
      thread,
      starter:
        input.starter === false
          ? null
          : { id, authorId: input.authorId ?? thread.ownerId, content: input.content ?? '' },
    });
    return thread;
  }

  get threadCount(): number {
    return this.threads.size;
  }

  private now(): number {
    return this.options.now?.() ?? NOW;
  }

  private record(method: Method, args: unknown[]): void {
    this.calls.push({ method, args });
    this.options.events?.push(`forum:${method}`);
    const queued = this.failures[method]?.shift();
    if (queued) throw queued;
  }

  async fetchForum(forumId: string): Promise<ForumSnapshot> {
    this.record('fetchForum', [forumId]);
    return { ...this.forum, availableTags: [...this.forum.availableTags] };
  }

  async fetchThread(threadId: string): Promise<ThreadSnapshot> {
    this.record('fetchThread', [threadId]);
    const stored = this.threads.get(threadId);
    if (!stored) throw apiError(404, 10003);
    return { ...stored.thread };
  }

  async fetchStarterMessage(threadId: string): Promise<StarterMessage> {
    this.record('fetchStarterMessage', [threadId]);
    const stored = this.threads.get(threadId);
    if (!stored) throw apiError(404, 10003);
    if (!stored.starter) throw apiError(404, 10008);
    return { ...stored.starter };
  }

  async listActiveThreads(guildId: string): Promise<ThreadSnapshot[]> {
    this.record('listActiveThreads', [guildId]);
    return [...this.threads.values()]
      .filter(({ thread }) => !thread.archived && thread.guildId === guildId)
      .map(({ thread }) => ({ ...thread }));
  }

  async listArchivedPage(
    forumId: string,
    before: string | null,
  ): Promise<{ threads: ThreadSnapshot[]; hasMore: boolean | undefined }> {
    this.record('listArchivedPage', [forumId, before]);
    const archived = [...this.threads.values()]
      .map(({ thread }) => thread)
      .filter((thread) => thread.archived && thread.parentId === forumId)
      .filter((thread) => before === null || (thread.archiveTimestamp ?? '') < before)
      .sort((a, b) => (b.archiveTimestamp ?? '').localeCompare(a.archiveTimestamp ?? ''));
    const page = archived.slice(0, this.archivedPageSize).map((thread) => ({ ...thread }));
    if (this.unsortedArchivedPages) page.reverse();
    return {
      threads: page,
      hasMore: this.omitHasMore ? undefined : archived.length > this.archivedPageSize,
    };
  }

  async createThread(forumId: string, body: CreateThreadBody): Promise<CreatedThread> {
    this.record('createThread', [forumId, body]);
    if (this.createMode === 'malformed') throw failure({ kind: 'malformed_response' });
    const thread = this.addThread({
      ownerId: BOT_USER_ID,
      name: body.name,
      content: body.message.content,
      parentId: forumId,
      archiveTimestamp: new Date(this.now()).toISOString(),
    });
    const starter = this.threads.get(thread.id)?.starter ?? null;
    switch (this.createMode) {
      case 'accept_then_timeout':
        throw failure({ kind: 'timeout' });
      case 'wrong_parent':
        return { thread: { ...thread, parentId: '111111111111111111' }, starterMessage: starter };
      case 'altered_content':
        return {
          thread,
          starterMessage: starter && { ...starter, content: `${starter.content} (edited)` },
        };
      case 'no_starter_in_response':
        return { thread, starterMessage: null };
      default:
        return { thread, starterMessage: starter };
    }
  }
}

export type Scripted =
  | { status: number; body?: unknown }
  | { status: number; rawBody: string }
  | { networkError: true };

export interface RecordedRequest {
  kind: 'claim' | 'checkpoint' | 'result' | 'other';
  url: string;
  method: string;
  headers: Record<string, string>;
  redirect: RequestRedirect | undefined;
  rawBody: string;
  body: unknown;
}

/** Scripted Hub service API behind an injected fetch. Unscripted calls get the happy path. */
export class FakeHub {
  readonly requests: RecordedRequest[] = [];
  readonly claims: Scripted[] = [];
  readonly checkpoints: Scripted[] = [];
  readonly results: Scripted[] = [];

  constructor(private readonly options: { events?: string[] } = {}) {}

  requestsTo(kind: RecordedRequest['kind']): RecordedRequest[] {
    return this.requests.filter((request) => request.kind === kind);
  }

  lastResult(): Record<string, unknown> {
    const results = this.requestsTo('result');
    if (results.length === 0) throw new Error('no result was posted');
    return results[results.length - 1].body as Record<string, unknown>;
  }

  readonly fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const kind: RecordedRequest['kind'] = path.endsWith('/claim')
      ? 'claim'
      : path.endsWith('/checkpoint')
        ? 'checkpoint'
        : path.endsWith('/result')
          ? 'result'
          : 'other';
    const rawBody = typeof init.body === 'string' ? init.body : '';
    this.requests.push({
      kind,
      url,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      redirect: init.redirect,
      rawBody,
      body: rawBody ? JSON.parse(rawBody) : undefined,
    });
    this.options.events?.push(`hub:${kind}`);
    const queue =
      kind === 'claim' ? this.claims : kind === 'checkpoint' ? this.checkpoints : this.results;
    const scripted: Scripted =
      queue.shift() ??
      (kind === 'claim'
        ? { status: 204 }
        : kind === 'checkpoint'
          ? { status: 200, body: { leaseExpiresAt: LEASE_EXPIRES_AT } }
          : kind === 'result'
            ? { status: 200, body: { state: 'recorded', idempotent: false } }
            : { status: 404, body: {} });
    if ('networkError' in scripted) throw new TypeError('fetch failed');
    const text = 'rawBody' in scripted ? scripted.rawBody : JSON.stringify(scripted.body ?? {});
    return new Response(scripted.status === 204 ? null : text, {
      status: scripted.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}
