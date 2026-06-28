/**
 * Channel/thread history exporter.
 *
 * Pulls the full message history (and downloads all media attachments) from a
 * Discord text channel, announcement channel, or forum thread, then writes a
 * machine-readable `messages.json` and a human-readable `transcript.md`.
 *
 * This is the data-collection step for "systematizing community projects": it
 * lets us snapshot a project thread (e.g. the `gfc-projects > finance brain`
 * post) so the contents can be analyzed and turned into a repeatable process.
 *
 * Usage:
 *   # 1. Find the channel/thread id (searches every guild the bot is in):
 *   pnpm exec ts-node ./src/scripts/dumpChannel.ts --list finance
 *
 *   # 2. Dump it by id:
 *   pnpm exec ts-node ./src/scripts/dumpChannel.ts --dump <channelOrThreadId>
 *
 * Output is written to ./exports/<guild>-<channel>-<id>/.
 */

import {
  AnyThreadChannel,
  ChannelType,
  Client,
  Collection,
  GatewayIntentBits,
  Guild,
  Message,
  TextBasedChannel,
} from 'discord.js';
import 'dotenv/config';
import { createWriteStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { fetchAllMessages as fetchAllMessagesShared } from '../utils/channelDump';

const discordBotToken = process.env.DISCORD_BOT_TOKEN ?? '';

const EXPORT_ROOT = './exports';

/** Channel types whose message history we can page through. */
const READABLE_TEXT_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

/** Sanitize a name so it is safe to use as a folder/file name. */
function slug(input: string): string {
  return (
    input
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'untitled'
  );
}

/**
 * Walk every guild the bot can see and collect each readable channel/thread,
 * including forum threads (active and archived). Optionally filter by a
 * case-insensitive name substring.
 */
async function listChannels(client: Client, term?: string): Promise<void> {
  const needle = term?.toLowerCase();
  const guilds = await client.guilds.fetch();

  for (const [, partialGuild] of guilds) {
    const guild = await partialGuild.fetch();
    const rows: Array<{ id: string; name: string; type: string; parent: string }> = [];

    const channels = await guild.channels.fetch();
    for (const [, channel] of channels) {
      if (!channel) continue;

      // Regular readable text-ish channels.
      if (READABLE_TEXT_TYPES.has(channel.type)) {
        rows.push({
          id: channel.id,
          name: channel.name,
          type: ChannelType[channel.type],
          parent: channel.parent?.name ?? '',
        });
      }

      // Forum/text channels can contain threads (this is where the
      // `gfc-projects > finance brain` post lives).
      if (
        channel.type === ChannelType.GuildForum ||
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement
      ) {
        const threadHolder = channel as unknown as {
          threads: {
            fetchActive: () => Promise<{ threads: Collection<string, AnyThreadChannel> }>;
            fetchArchived: () => Promise<{ threads: Collection<string, AnyThreadChannel> }>;
          };
        };
        const collected = new Collection<string, AnyThreadChannel>();
        try {
          const active = await threadHolder.threads.fetchActive();
          active.threads.forEach((t) => collected.set(t.id, t));
        } catch {
          /* ignore */
        }
        try {
          const archived = await threadHolder.threads.fetchArchived();
          archived.threads.forEach((t) => collected.set(t.id, t));
        } catch {
          /* ignore */
        }
        for (const [, thread] of collected) {
          rows.push({
            id: thread.id,
            name: thread.name,
            type: `THREAD(${ChannelType[channel.type]})`,
            parent: channel.name,
          });
        }
      }
    }

    const filtered = needle
      ? rows.filter(
          (r) => r.name.toLowerCase().includes(needle) || r.parent.toLowerCase().includes(needle),
        )
      : rows;

    if (filtered.length === 0) continue;

    console.log(`\n=== Guild: ${guild.name} (${guild.id}) ===`);
    for (const r of filtered) {
      const where = r.parent ? `${r.parent} > ` : '';
      console.log(`  ${r.id}  [${r.type}]  ${where}${r.name}`);
    }
  }
}

interface DumpedAttachment {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  size: number;
  localFile: string | null;
}

interface DumpedMessage {
  id: string;
  author: string;
  authorId: string;
  createdAt: string;
  content: string;
  attachments: DumpedAttachment[];
  embedCount: number;
  reactions: Array<{ emoji: string; count: number }>;
}

/** Stream a remote URL to disk. */
async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const fileStream = createWriteStream(dest);
  // Node's fetch body is a web ReadableStream; adapt it to a node stream.
  await finished(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]).pipe(fileStream),
  );
}

/** Page backwards through a channel/thread's entire history (oldest -> newest). */
async function fetchAllMessages(channel: TextBasedChannel): Promise<Message[]> {
  const messages = await fetchAllMessagesShared(channel, (count) => {
    process.stdout.write(`\r  fetched ${count} messages...`);
  });
  process.stdout.write('\n');
  return messages;
}

async function dumpChannel(client: Client, channelId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found / not visible to the bot.`);
  if (!('messages' in channel)) {
    throw new Error(`Channel ${channelId} (type ${ChannelType[channel.type]}) is not text-based.`);
  }

  const named = channel as unknown as { name?: string; guild?: Guild };
  const channelName = named.name ?? channelId;
  const guildName = named.guild?.name ?? 'dm';
  const dir = `${EXPORT_ROOT}/${slug(guildName)}-${slug(channelName)}-${channelId}`;
  const mediaDir = `${dir}/media`;
  await mkdir(mediaDir, { recursive: true });

  console.log(`Dumping "${channelName}" (${channelId}) from "${guildName}" -> ${dir}`);

  const messages = await fetchAllMessages(channel as TextBasedChannel);

  const dumped: DumpedMessage[] = [];
  let mediaCount = 0;

  for (const msg of messages) {
    const attachments: DumpedAttachment[] = [];
    for (const [, att] of msg.attachments) {
      const fileName = `${msg.id}-${slug(att.name ?? 'file')}`;
      const localPath = `${mediaDir}/${fileName}`;
      let saved: string | null = null;
      try {
        await download(att.url, localPath);
        saved = `media/${fileName}`;
        mediaCount += 1;
      } catch (err) {
        console.warn(`  ! failed to download ${att.url}: ${(err as Error).message}`);
      }
      attachments.push({
        id: att.id,
        name: att.name ?? '',
        url: att.url,
        contentType: att.contentType,
        size: att.size,
        localFile: saved,
      });
    }

    dumped.push({
      id: msg.id,
      author: msg.author?.tag ?? msg.author?.username ?? 'unknown',
      authorId: msg.author?.id ?? '',
      createdAt: new Date(msg.createdTimestamp).toISOString(),
      content: msg.content,
      attachments,
      embedCount: msg.embeds.length,
      reactions: msg.reactions.cache.map((r) => ({
        emoji: r.emoji.name ?? r.emoji.id ?? '?',
        count: r.count,
      })),
    });
  }

  // Machine-readable dump.
  await writeFile(
    `${dir}/messages.json`,
    JSON.stringify(
      { channelId, channelName, guildName, exportedMessages: dumped.length, messages: dumped },
      null,
      2,
    ),
  );

  // Human-readable transcript.
  const lines: string[] = [`# ${guildName} / ${channelName}`, '', `${dumped.length} messages`, ''];
  for (const m of dumped) {
    lines.push(`### ${m.author} — ${m.createdAt}`);
    if (m.content) lines.push(m.content);
    for (const a of m.attachments) {
      lines.push(
        `- 📎 ${a.name} (${a.contentType ?? 'unknown'}, ${a.size} bytes)${a.localFile ? ` -> ${a.localFile}` : ` -> ${a.url}`}`,
      );
    }
    if (m.embedCount) lines.push(`- (${m.embedCount} embed(s))`);
    lines.push('');
  }
  await writeFile(`${dir}/transcript.md`, lines.join('\n'));

  console.log(`Done: ${dumped.length} messages, ${mediaCount} media files saved to ${dir}`);
}

async function main(): Promise<void> {
  const [, , mode, arg] = process.argv;

  if (!discordBotToken) {
    console.error('DISCORD_BOT_TOKEN is not set in .env');
    process.exit(1);
  }
  if (mode !== '--list' && mode !== '--dump') {
    console.error('Usage:\n  --list [searchTerm]\n  --dump <channelOrThreadId>');
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', async () => {
    try {
      if (mode === '--list') {
        await listChannels(client, arg);
      } else {
        await dumpChannel(client, arg);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
    } finally {
      client.destroy();
      process.exit(0);
    }
  });

  await client.login(discordBotToken);
}

void main();
