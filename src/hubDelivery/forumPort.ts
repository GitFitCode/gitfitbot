/**
 * The only surface through which Hub delivery touches Discord. Operations depend on
 * the ForumPort interface; production uses the discord.js-backed implementation and
 * tests use an in-memory fake.
 *
 * Reads go through the client's shared REST manager (idempotent GETs may retry).
 * Creates go through a dedicated single-shot REST instance: `retries: 0` and
 * `rejectOnRateLimit` always true, because @discordjs/rest otherwise retries 5xx,
 * aborts and ECONNRESET up to 3 times and silently replays 429s — each a possible
 * duplicate forum post.
 */

import {
  DefaultRestOptions,
  DiscordAPIError,
  HTTPError,
  MessageFlags,
  RateLimitError,
  REST,
  Routes,
  type Client,
  type RESTOptions,
} from 'discord.js';
import { z } from 'zod';
import { snowflakeSchema, type DeliveryPost } from './contract';

export const DISCORD_CREATE_TIMEOUT_MS = 15_000;

export interface ForumSnapshot {
  id: string;
  guildId: string;
  type: number;
  flags: number;
  availableTags: { id: string; moderated: boolean }[];
}

export interface ThreadSnapshot {
  id: string;
  guildId: string;
  parentId: string;
  type: number;
  ownerId: string;
  name: string;
  archived: boolean;
  locked: boolean;
  archiveTimestamp: string | null;
}

export interface StarterMessage {
  id: string;
  authorId: string;
  content: string;
}

export interface ArchivedThreadPage {
  threads: ThreadSnapshot[];
  /** `undefined` when Discord omitted `has_more`; callers must treat that as incomplete. */
  hasMore: boolean | undefined;
}

export interface CreateThreadBody {
  name: string;
  applied_tags: string[];
  message: { content: string; allowed_mentions: { parse: never[] }; flags: number };
}

export interface CreatedThread {
  thread: ThreadSnapshot;
  /** The starter message when the response carried a parseable one. */
  starterMessage: StarterMessage | null;
}

export type ForumFailure =
  | { kind: 'api'; status: number; code: number | null }
  | { kind: 'rate_limited'; retryAfterMs: number; requestSent: boolean }
  | { kind: 'server_error'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network'; requestSent: boolean }
  | { kind: 'malformed_response' };

export class ForumPortError extends Error {
  constructor(readonly failure: ForumFailure) {
    super(`Discord forum operation failed: ${failure.kind}`);
    this.name = 'ForumPortError';
  }
}

export interface ForumPort {
  fetchForum(forumId: string): Promise<ForumSnapshot>;
  fetchThread(threadId: string): Promise<ThreadSnapshot>;
  /** A forum thread's starter message shares the thread's ID (see ThreadChannel#fetchStarterMessage). */
  fetchStarterMessage(threadId: string): Promise<StarterMessage>;
  listActiveThreads(guildId: string): Promise<ThreadSnapshot[]>;
  listArchivedPage(forumId: string, before: string | null): Promise<ArchivedThreadPage>;
  /** Exactly one network attempt; never retried below this call. */
  createThread(forumId: string, body: CreateThreadBody): Promise<CreatedThread>;
}

/** Exact Hub-rendered content, no mentions, no embeds, bot-configured tags only. */
export function buildCreateThreadBody(
  post: DeliveryPost,
  tagIds: readonly string[],
): CreateThreadBody {
  return {
    name: post.threadName,
    applied_tags: [...tagIds],
    message: {
      content: post.content,
      allowed_mentions: { parse: [] },
      flags: MessageFlags.SuppressEmbeds,
    },
  };
}

const rawForumSchema = z.object({
  id: snowflakeSchema,
  guild_id: snowflakeSchema,
  type: z.number().int(),
  flags: z.number().int().optional(),
  available_tags: z.array(z.object({ id: snowflakeSchema, moderated: z.boolean() })).optional(),
});

const rawThreadSchema = z.object({
  id: snowflakeSchema,
  guild_id: snowflakeSchema,
  parent_id: snowflakeSchema,
  type: z.number().int(),
  owner_id: snowflakeSchema,
  name: z.string(),
  thread_metadata: z.object({
    archived: z.boolean(),
    locked: z.boolean(),
    archive_timestamp: z.string().optional(),
  }),
});

const rawMessageSchema = z.object({
  id: snowflakeSchema,
  content: z.string(),
  author: z.object({ id: snowflakeSchema }),
});

const rawThreadListSchema = z.object({
  threads: z.array(rawThreadSchema),
  has_more: z.boolean().optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ForumPortError({ kind: 'malformed_response' });
  return parsed.data;
}

function toThread(raw: z.infer<typeof rawThreadSchema>): ThreadSnapshot {
  return {
    id: raw.id,
    guildId: raw.guild_id,
    parentId: raw.parent_id,
    type: raw.type,
    ownerId: raw.owner_id,
    name: raw.name,
    archived: raw.thread_metadata.archived,
    locked: raw.thread_metadata.locked,
    archiveTimestamp: raw.thread_metadata.archive_timestamp ?? null,
  };
}

function toMessage(raw: z.infer<typeof rawMessageSchema>): StarterMessage {
  return { id: raw.id, authorId: raw.author.id, content: raw.content };
}

// Failures raised while establishing the connection: the request never left the process.
const PRE_CONNECT_ERROR_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, cause } = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof code === 'string') return code;
  return typeof cause?.code === 'string' ? cause.code : undefined;
}

/** Maps @discordjs/rest errors without swallowing anything. */
export function toForumPortError(error: unknown, requestSent: boolean): ForumPortError {
  if (error instanceof ForumPortError) return error;
  if (error instanceof RateLimitError)
    return new ForumPortError({
      kind: 'rate_limited',
      retryAfterMs: Math.max(0, Math.ceil(error.retryAfter)),
      requestSent,
    });
  if (error instanceof DiscordAPIError)
    return new ForumPortError({
      kind: 'api',
      status: error.status,
      code: typeof error.code === 'number' ? error.code : null,
    });
  if (error instanceof HTTPError)
    return new ForumPortError({ kind: 'server_error', status: error.status });
  if (error instanceof Error && error.name === 'AbortError')
    return new ForumPortError({ kind: 'timeout' });
  const code = errorCode(error);
  return new ForumPortError({
    kind: 'network',
    requestSent: requestSent && !(code !== undefined && PRE_CONNECT_ERROR_CODES.has(code)),
  });
}

export interface DispatchTracker {
  /** Set when @discordjs/rest hands the request to the transport (after its rate-limit gate). */
  dispatched: boolean;
}

type MakeRequest = RESTOptions['makeRequest'];
/** The HTTP transport beneath @discordjs/rest; tests substitute one returning a fetch Response. */
type Transport = (url: string, init: Parameters<MakeRequest>[1]) => Promise<unknown>;

export function createSingleShotRest(
  tracker: DispatchTracker,
  transport: Transport = DefaultRestOptions.makeRequest,
): REST {
  return new REST({
    retries: 0,
    timeout: DISCORD_CREATE_TIMEOUT_MS,
    rejectOnRateLimit: () => true,
    makeRequest: async (url, init) => {
      tracker.dispatched = true;
      return (await transport(url, init)) as Awaited<ReturnType<MakeRequest>>;
    },
  });
}

export class DiscordForumPort implements ForumPort {
  private readonly tracker: DispatchTracker = { dispatched: false };
  private readonly createRest: REST;
  private createInFlight = false;

  constructor(
    private readonly client: Client,
    options: { createRest?: (tracker: DispatchTracker) => REST } = {},
  ) {
    this.createRest = (options.createRest ?? createSingleShotRest)(this.tracker);
  }

  async fetchForum(forumId: string): Promise<ForumSnapshot> {
    const raw = parseOrThrow(rawForumSchema, await this.read(Routes.channel(forumId)));
    return {
      id: raw.id,
      guildId: raw.guild_id,
      type: raw.type,
      flags: raw.flags ?? 0,
      availableTags: (raw.available_tags ?? []).map((tag) => ({
        id: tag.id,
        moderated: tag.moderated,
      })),
    };
  }

  async fetchThread(threadId: string): Promise<ThreadSnapshot> {
    return toThread(parseOrThrow(rawThreadSchema, await this.read(Routes.channel(threadId))));
  }

  async fetchStarterMessage(threadId: string): Promise<StarterMessage> {
    const raw = await this.read(Routes.channelMessage(threadId, threadId));
    return toMessage(parseOrThrow(rawMessageSchema, raw));
  }

  async listActiveThreads(guildId: string): Promise<ThreadSnapshot[]> {
    const raw = parseOrThrow(
      rawThreadListSchema,
      await this.read(Routes.guildActiveThreads(guildId)),
    );
    return raw.threads.map(toThread);
  }

  async listArchivedPage(forumId: string, before: string | null): Promise<ArchivedThreadPage> {
    const query = new URLSearchParams({ limit: '100' });
    if (before !== null) query.set('before', before);
    const raw = parseOrThrow(
      rawThreadListSchema,
      await this.read(Routes.channelThreads(forumId, 'public'), query),
    );
    return { threads: raw.threads.map(toThread), hasMore: raw.has_more };
  }

  async createThread(forumId: string, body: CreateThreadBody): Promise<CreatedThread> {
    if (this.createInFlight || !this.client.token)
      throw new ForumPortError({ kind: 'network', requestSent: false });
    this.createInFlight = true;
    this.tracker.dispatched = false;
    try {
      this.createRest.setToken(this.client.token);
      let raw: unknown;
      try {
        raw = await this.createRest.post(Routes.threads(forumId), { body });
      } catch (error) {
        throw toForumPortError(error, this.tracker.dispatched);
      }
      const thread = toThread(parseOrThrow(rawThreadSchema, raw));
      const message = rawMessageSchema.safeParse((raw as { message?: unknown }).message);
      return { thread, starterMessage: message.success ? toMessage(message.data) : null };
    } finally {
      this.createInFlight = false;
    }
  }

  private async read(route: `/${string}`, query?: URLSearchParams): Promise<unknown> {
    try {
      return await this.client.rest.get(route, query ? { query } : undefined);
    } catch (error) {
      throw toForumPortError(error, true);
    }
  }
}
