import { getProjectInitUrl, PROJECT_HUB_ORIGIN_ENV } from '../utils/projectInit';
import { snowflakeSchema } from './contract';

export const DELIVERY_ENABLED_ENV = 'GFC_PROJECT_DELIVERY_ENABLED';
export const DELIVERY_TOKEN_ENV = 'GFC_HUB_DELIVERY_TOKEN';
export const PROJECT_TAG_IDS_ENV = 'GFC_PROJECTS_TAG_IDS';

// discord-api-types RESTPostAPIGuildForumThreadsJSONBody.applied_tags: "limited to 5".
const MAX_APPLIED_TAGS = 5;
// ≥32 random bytes as base64url (43 chars); capped to keep headers bounded.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,512}$/;

type Env = Record<string, string | undefined>;

export type TagConfig = { ok: true; ids: string[] } | { ok: false };

export type DeliveryConfig =
  | { enabled: true; origin: string; token: string; tags: TagConfig }
  | { enabled: false; reason: 'disabled' | 'invalid_origin' | 'invalid_token' };

/** Bot-configured forum tag IDs only; an invalid value blocks creates rather than being ignored. */
export function parseTagConfig(raw: string | undefined): TagConfig {
  if (raw === undefined || raw.trim() === '') return { ok: true, ids: [] };
  const ids = raw.split(',').map((part) => part.trim());
  const valid =
    ids.length <= MAX_APPLIED_TAGS &&
    new Set(ids).size === ids.length &&
    ids.every((id) => snowflakeSchema.safeParse(id).success);
  return valid ? { ok: true, ids } : { ok: false };
}

/** Delivery stays off unless explicitly enabled with a safe Hub origin and a well-formed token. */
export function readDeliveryConfig(env: Env = process.env): DeliveryConfig {
  if (env[DELIVERY_ENABLED_ENV] !== 'true') return { enabled: false, reason: 'disabled' };

  const configuredOrigin = env[PROJECT_HUB_ORIGIN_ENV];
  let origin: string;
  try {
    if (!configuredOrigin) throw new Error('missing origin');
    getProjectInitUrl(configuredOrigin);
    origin = new URL(configuredOrigin).origin;
  } catch {
    return { enabled: false, reason: 'invalid_origin' };
  }

  const token = env[DELIVERY_TOKEN_ENV];
  if (!token || !TOKEN_PATTERN.test(token)) return { enabled: false, reason: 'invalid_token' };

  return { enabled: true, origin, token, tags: parseTagConfig(env[PROJECT_TAG_IDS_ENV]) };
}
