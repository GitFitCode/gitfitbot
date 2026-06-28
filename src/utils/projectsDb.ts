/**
 * Persistence for digested Discord posts (the "projects" store).
 *
 * Each Discord forum post maps 1:1 to a row in `discord_post_digests` (a
 * dedicated table, NOT the conduit/chip `projects` tables). A row can optionally
 * be linked to a real conduit project via `linked_project_id`.
 *
 * Backed by a direct Postgres connection (SUPABASE_DB_URL). All functions are
 * best-effort: if no DB is configured or a query fails, they return null/[] and
 * log, so a digest still works without the DB.
 */

import 'dotenv/config';
import { Pool } from 'pg';

let pool: Pool | undefined;

function getPool(): Pool | undefined {
  if (!process.env.SUPABASE_DB_URL) {
    return undefined;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export interface PostDigestInput {
  discordPostId: string;
  guildId: string | null;
  name: string;
  digest: string;
  messageCount: number;
}

export interface SavedPostDigest {
  id: string;
  linkedProjectId: string | null;
}

/**
 * Upserts a digested post (keyed by discord_post_id — 1 post = 1 record).
 *
 * @returns The saved row's id + any linked project, or null if the DB is
 * unconfigured or the write fails.
 */
export async function upsertPostDigest(input: PostDigestInput): Promise<SavedPostDigest | null> {
  const db = getPool();
  if (!db) {
    return null;
  }
  try {
    const result = await db.query(
      `insert into discord_post_digests
         (discord_post_id, guild_id, name, digest, message_count, last_digested_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), now())
       on conflict (discord_post_id) do update set
         name = excluded.name,
         guild_id = excluded.guild_id,
         digest = excluded.digest,
         message_count = excluded.message_count,
         last_digested_at = now(),
         updated_at = now()
       returning id, linked_project_id`,
      [input.discordPostId, input.guildId, input.name, input.digest, input.messageCount],
    );
    const row = result.rows[0];
    return { id: row.id, linkedProjectId: row.linked_project_id ?? null };
  } catch (err) {
    console.error('Failed to persist post digest:', (err as Error).message);
    return null;
  }
}
