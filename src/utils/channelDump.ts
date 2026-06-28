/**
 * Shared helpers for exporting Discord channel/thread history.
 *
 * Used by both the `dumpChannel.ts` CLI script and the `/project-digest`
 * slash command so message-fetching logic lives in one place.
 */

import { AnyThreadChannel, Client, Collection, Message, TextBasedChannel } from 'discord.js';

import { DISCORD_MESSAGE_MAX_CHAR_LIMIT } from './constants';

export interface ForumThreadRef {
  id: string;
  name: string;
}

/**
 * Lists every thread (active + archived) in a forum channel as {id, name},
 * newest-id first. Used to power the /project-digest thread picker.
 */
export async function listForumThreads(client: Client, forumId: string): Promise<ForumThreadRef[]> {
  const channel = await client.channels.fetch(forumId);
  const holder = channel as unknown as {
    threads: {
      fetchActive: () => Promise<{ threads: Collection<string, AnyThreadChannel> }>;
      fetchArchived: () => Promise<{ threads: Collection<string, AnyThreadChannel> }>;
    };
  };

  const byId = new Map<string, string>();
  try {
    (await holder.threads.fetchActive()).threads.forEach((t) => byId.set(t.id, t.name));
  } catch {
    /* ignore */
  }
  try {
    (await holder.threads.fetchArchived()).threads.forEach((t) => byId.set(t.id, t.name));
  } catch {
    /* ignore */
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Split text into chunks that respect Discord's per-message character limit,
 * breaking on line boundaries where possible and hard-splitting overlong lines.
 */
export function chunkForDiscord(text: string, limit = DISCORD_MESSAGE_MAX_CHAR_LIMIT): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if (line.length > limit) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit));
      }
      continue;
    }
    if (current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface CondensedMessage {
  author: string;
  createdAt: string;
  content: string;
  attachmentNames: string[];
}

/**
 * Page backwards through a channel/thread's entire history and return the
 * messages sorted oldest -> newest.
 *
 * discord.js caps each fetch at 100, so we loop with a `before` cursor until a
 * short page comes back. `onProgress` is invoked with the running total so
 * callers can surface progress.
 */
export async function fetchAllMessages(
  channel: TextBasedChannel,
  onProgress?: (count: number) => void,
): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch: Collection<string, Message> = await channel.messages.fetch({
      limit: 100,
      before,
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last()?.id;
    onProgress?.(all.length);
    if (batch.size < 100) break;
  }

  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/**
 * Page backwards through a channel/thread's history but stop once messages are
 * older than `sinceTs`. Returns only messages at/after the cutoff, sorted
 * oldest -> newest. Efficient for "what happened recently" use cases.
 */
export async function fetchMessagesSince(
  channel: TextBasedChannel,
  sinceTs: number,
): Promise<Message[]> {
  const collected: Message[] = [];
  let before: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch: Collection<string, Message> = await channel.messages.fetch({
      limit: 100,
      before,
    });
    if (batch.size === 0) break;

    const recent = [...batch.values()].filter((m) => m.createdTimestamp >= sinceTs);
    collected.push(...recent);

    // If this page contains anything older than the cutoff, we're done.
    const reachedCutoff = batch.some((m) => m.createdTimestamp < sinceTs);
    if (reachedCutoff || batch.size < 100) break;
    before = batch.last()?.id;
  }

  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/** Reduce full messages to the minimal fields needed for summarization. */
export function condenseMessages(messages: Message[]): CondensedMessage[] {
  return messages.map((msg) => ({
    author: msg.author?.tag ?? msg.author?.username ?? 'unknown',
    createdAt: new Date(msg.createdTimestamp).toISOString().slice(0, 10),
    content: msg.content,
    attachmentNames: [...msg.attachments.values()].map((a) => a.name ?? 'file'),
  }));
}

/**
 * Render condensed messages into a plain-text transcript suitable for feeding
 * to an LLM. Truncates from the START (keeping the most recent context) if it
 * would exceed `maxChars`, prepending a note when that happens.
 */
export function buildTranscriptText(
  messages: CondensedMessage[],
  maxChars = 120_000,
): { text: string; truncated: boolean } {
  const lines = messages.map((m) => {
    const media = m.attachmentNames.length ? ` [media: ${m.attachmentNames.join(', ')}]` : '';
    return `${m.createdAt} ${m.author}: ${m.content}${media}`;
  });
  let text = lines.join('\n');
  let truncated = false;
  if (text.length > maxChars) {
    truncated = true;
    text =
      `[NOTE: transcript truncated to the most recent ${maxChars} characters]\n` +
      text.slice(text.length - maxChars);
  }
  return { text, truncated };
}
