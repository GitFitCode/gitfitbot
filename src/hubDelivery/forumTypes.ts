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
