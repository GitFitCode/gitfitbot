import { z } from 'zod';
import { snowflakeSchema } from '../hubDelivery/contract';
import { ReadFailure } from './service';
const bitsSchema = z.string().regex(/^\d+$/).transform(BigInt);
const roleSchema = z.object({ id: snowflakeSchema, permissions: bitsSchema });
const overwriteSchema = z.object({
  id: snowflakeSchema,
  type: z.union([z.literal(0), z.literal(1)]),
  allow: bitsSchema,
  deny: bitsSchema
});
/** Public threads inherit forum overwrites. Inputs must be fresh REST snapshots. */
export function hasHistoryPermissions(input: {
  guildId: string;
  botId: string;
  roles: unknown;
  member: unknown;
  forum: unknown;
  flags: {
    Administrator: bigint;
    ViewChannel: bigint;
    ReadMessageHistory: bigint;
  };
}): boolean {
  const roles = z.array(roleSchema).safeParse(input.roles);
  const member = z.object({ roles: z.array(snowflakeSchema) }).safeParse(input.member);
  const forum = z.object({ permission_overwrites: z.array(overwriteSchema) }).safeParse(input.forum);
  if (!roles.success || !member.success || !forum.success)
    throw new ReadFailure('failed');
  const roleIds = new Set([input.guildId, ...member.data.roles]);
  let permissions = roles.data.filter((r) => roleIds.has(r.id)).reduce((bits, r) => bits | r.permissions, 0n);
  if ((permissions & input.flags.Administrator) !== 0n)
    return true;
  const apply = (overwrites: z.infer<typeof overwriteSchema>[]) => {
    permissions &= ~overwrites.reduce((bits, o) => bits | o.deny, 0n);
    permissions |= overwrites.reduce((bits, o) => bits | o.allow, 0n);
  };
  apply(forum.data.permission_overwrites.filter((o) => o.id === input.guildId));
  apply(forum.data.permission_overwrites.filter((o) => o.type === 0 && o.id !== input.guildId && roleIds.has(o.id)));
  apply(forum.data.permission_overwrites.filter((o) => o.type === 1 && o.id === input.botId));
  const required = input.flags.ViewChannel | input.flags.ReadMessageHistory;
  return (permissions & required) === required;
}
