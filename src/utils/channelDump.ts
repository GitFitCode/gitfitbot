/**
 * Shared helpers for exporting Discord channel/thread history.
 *
 * Used by both the `dumpChannel.ts` CLI script and the `/project-digest`
 * slash command so message-fetching logic lives in one place.
 */

import { Collection, Message, TextBasedChannel } from 'discord.js';

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
