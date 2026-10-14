import { GatewayIntentBits, PermissionFlagsBits, REST, Routes, type Client } from 'discord.js';
import { z } from 'zod';
import { snowflakeSchema } from '../hubDelivery/contract';
import { DiscordForumPort, ForumPortError, toForumPortError } from '../hubDelivery/forumPort';
import { DiscordReadAdapter } from './discordAdapter';
import { hasHistoryPermissions } from './permissions';
import { ReadFailure, ThreadReadService, type Grant } from './service';
/** Opt-in construction only. No login, listener, environment lookup, or command registration. */
export function createDiscordReader(
  client: Client,
  grantsFor: (caller: string) => readonly Grant[],
): ThreadReadService {
  // Surface 429s and bound each REST attempt, rather than waiting/retrying inside collection.
  const rest = new REST({ retries: 0, timeout: 15000, rejectOnRateLimit: () => true });
  const readRest = {
    get: async (
      route: `/${string}`,
      options?: {
        query?: URLSearchParams;
      },
    ): Promise<unknown> => {
      if (!client.token) throw new ForumPortError({ kind: 'api', status: 401, code: null });
      rest.setToken(client.token);
      return rest.get(route, options);
    },
  };
  const forums = new DiscordForumPort(client, { readRest });
  const adapter = new DiscordReadAdapter(
    {
      fetchForum: (id) => attempt(() => forums.fetchForum(id)),
      fetchThread: (id) => attempt(() => forums.fetchThread(id)),
      listActiveThreads: (id) => attempt(() => forums.listActiveThreads(id)),
      listArchivedPage: (id, before) => attempt(() => forums.listArchivedPage(id, before)),
    },
    {
      assertReadable: async (id) => {
        if (!client.options.intents.has(GatewayIntentBits.MessageContent))
          throw new ReadFailure('unavailable');
        await attempt(async () => {
          if (!client.user) throw new ReadFailure('unavailable');
          const thread = z
            .object({ guild_id: snowflakeSchema, parent_id: snowflakeSchema, type: z.literal(11) })
            .parse(await readRest.get(Routes.channel(id)));
          const forum = await readRest.get(Routes.channel(thread.parent_id));
          const roles = await readRest.get(Routes.guildRoles(thread.guild_id));
          const member = await readRest.get(Routes.guildMember(thread.guild_id, client.user.id));
          if (
            !hasHistoryPermissions({
              guildId: thread.guild_id,
              botId: client.user.id,
              roles,
              member,
              forum,
              flags: PermissionFlagsBits,
            })
          )
            throw new ReadFailure('unavailable');
        });
      },
      getMessages: (id, before, limit) =>
        attempt(() =>
          readRest.get(Routes.channelMessages(id), {
            query: new URLSearchParams({ before, limit: String(limit) }),
          }),
        ),
    },
  );
  return new ThreadReadService(adapter, grantsFor);
}
async function attempt<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ReadFailure) throw error;
    const { failure } = toForumPortError(error, true);
    if (failure.kind === 'rate_limited')
      throw new ReadFailure('rate_limited', failure.retryAfterMs);
    if (failure.kind === 'api' && [401, 403, 404].includes(failure.status))
      throw new ReadFailure('unavailable');
    if (failure.kind === 'api' && failure.status === 429) throw new ReadFailure('rate_limited');
    throw new ReadFailure('failed');
  }
}
