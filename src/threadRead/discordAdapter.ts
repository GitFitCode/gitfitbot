import { z } from 'zod';
import { snowflakeSchema } from '../hubDelivery/contract';
import { ReadFailure, type MessageEvidence, type ReadPort } from './service';
const rawMessageSchema = z.object({
  id: snowflakeSchema,
  channel_id: snowflakeSchema,
  author: z.object({
    id: snowflakeSchema,
    username: z.string(),
    global_name: z.string().nullable().optional()
  }),
  member: z.object({ nick: z.string().nullable().optional() }).optional(),
  timestamp: z.string().datetime({ offset: true }),
  edited_timestamp: z.string().datetime({ offset: true }).nullable(),
  content: z.string(),
  attachments: z.array(z.object({
    id: snowflakeSchema,
    filename: z.string(),
    url: z.string().url(),
    size: z.number().int().nonnegative(),
    content_type: z.string().nullable().optional()
  })),
});
export type ForumReads = Omit<ReadPort, 'fetchMessages'>;
export interface MessageReads {
  /** Must verify current ViewChannel, ReadMessageHistory and message-content availability. */
  assertReadable(threadId: string): Promise<void>;
  getMessages(threadId: string, before: string, limit: number): Promise<unknown>;
}
/** All capabilities are injected read operations. The assistant never receives this adapter. */
export class DiscordReadAdapter implements ReadPort {
  constructor(private readonly forums: ForumReads, private readonly messages: MessageReads) { }
  fetchForum: ReadPort['fetchForum'] = (id) => this.forums.fetchForum(id);
  fetchThread: ReadPort['fetchThread'] = (id) => this.forums.fetchThread(id);
  listActiveThreads: ReadPort['listActiveThreads'] = (id) => this.forums.listActiveThreads(id);
  listArchivedPage: ReadPort['listArchivedPage'] = (id, before) => this.forums.listArchivedPage(id, before);
  async fetchMessages(threadId: string, before: string, limit: number): Promise<MessageEvidence[]> {
    await this.messages.assertReadable(threadId);
    const raw = z.array(rawMessageSchema).max(limit).safeParse(await this.messages.getMessages(threadId, before, limit));
    if (!raw.success || raw.data.some((m) => m.channel_id !== threadId))
      throw new ReadFailure('failed');
    // Discord returns [] when ReadMessageHistory is missing. Recheck before claiming emptiness.
    if (raw.data.length === 0)
      await this.messages.assertReadable(threadId);
    return raw.data.map((m) => ({
      id: m.id,
      threadId: m.channel_id,
      authorId: m.author.id,
      authorDisplayName: m.member?.nick ?? m.author.global_name ?? m.author.username,
      createdAt: m.timestamp,
      editedAt: m.edited_timestamp,
      content: m.content,
      url: '', // The service constructs canonical URLs only after checking the observed guild/thread.
      attachments: m.attachments.map((a) => ({
        id: a.id,
        name: a.filename,
        url: a.url,
        size: a.size,
        contentType: a.content_type ?? null
      })),
    }));
  }
}
