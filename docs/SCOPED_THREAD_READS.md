# Scoped Discord reads

Issue #105 adds an opt-in, in-process JSON contract, `gfc.discord-read.v1`. It does not register a Discord command, MCP tool, listener, worker, or scheduled job. Existing digest and bulk-export behavior is unchanged.

## Host integration and authority

A trusted host constructs `createDiscordReader(client, grantsFor)` with its existing Discord client and a function that resolves current grants for an authenticated caller. The host calls `reader.read(authenticatedCallerId, request)` and returns the JSON response. Never take the caller ID or grants from assistant arguments. The default policy should return `[]`. Each grant names exactly one guild and forum, with either `{ kind: 'all' }` or `{ kind: 'ids', ids: [...] }` for threads.

The service checks the current grant on every call, including continuations, then checks fetched forum and thread identity, guild, parent and channel type. Only public threads in a forum are supported. An exact ID is not authority. Out-of-scope lookup candidates are not returned. Unknown request fields, including credentials or caller IDs, are rejected.

The factory keeps the existing bot credential behind read-only adapter methods. It reuses `DiscordForumPort` metadata parsing and error handling; the shared snapshot types live in `hubDelivery/forumTypes.ts`. The delivery port's optional `readRest` injection preserves its existing default behavior. No delivery operation is exposed through the reader.

Before each history page, the adapter checks fresh forum overwrites, guild roles, and the bot member's roles for ViewChannel and ReadMessageHistory. It requires configured MessageContent intent. It rechecks permission after an empty response because Discord can return an empty array when ReadMessageHistory is missing. The host must use an authorized, initialized client with MessageContent available. Permission checks and reads are not an atomic Discord snapshot.

## Requests

An exact lookup:

```json
{
  "kind": "lookup",
  "scope": { "guildId": "328054349420822530", "forumId": "1032761290919260262" },
  "query": { "kind": "id", "id": "1400000000000000000" },
  "maxPages": 3
}
```

For a case-insensitive title substring, use `"query": { "kind": "name", "text": "build" }`. The query must contain 1 to 100 characters after trimming. The service never selects one ambiguous result.

A bounded history read:

```json
{
  "kind": "history",
  "scope": { "guildId": "328054349420822530", "forumId": "1032761290919260262" },
  "threadId": "1400000000000000000",
  "since": "2026-10-08T00:00:00.000Z",
  "until": "2026-10-08T12:00:00.000Z",
  "maxPages": 2,
  "maxMessages": 100
}
```

The interval is `[since, until)`. Bounds use UTC millisecond timestamps, cannot precede the Discord epoch, cannot end in the future, and cannot span more than 31 days. Messages retain the exact upstream timestamp strings, including fractional precision and offsets. The upper bound is converted to a snowflake before the first request, avoiding a scan from the present through unrelated newer history.

Server limits are 1 to 5 collection pages per call, 1 to 500 scanned messages per history call, 100 messages per Discord page, 100 returned lookup matches, and 1,000 active-thread entries per upstream listing. Overlarge requests are rejected rather than silently broadened. Metadata and permission reads are additional bounded requests; each production REST attempt has a 15-second timeout, zero configured retries, and explicit rate-limit rejection.

## Responses

A complete, empty history result is a success with an exhausted interval:

```json
{
  "contract": "gfc.discord-read.v1",
  "status": "complete",
  "resolution": null,
  "threads": [],
  "messages": [],
  "retryAfterMs": null,
  "coverage": {
    "requested": {
      "kind": "history",
      "scope": { "guildId": "328054349420822530", "forumId": "1032761290919260262" },
      "threadId": "1400000000000000000",
      "since": "2026-10-08T00:00:00.000Z",
      "until": "2026-10-08T12:00:00.000Z",
      "maxPages": 2,
      "maxMessages": 100
    },
    "retrievedAt": "2026-10-08T12:00:00.000Z",
    "oldest": null,
    "newest": null,
    "pagesRead": 1,
    "messagesRead": 0,
    "threadsRead": 0,
    "nextCursor": null,
    "reason": null,
    "intervalExhausted": true
  }
}
```

Each nonempty message includes `id`, `threadId`, `authorId`, `authorDisplayName`, `createdAt`, nullable `editedAt`, verbatim `content`, a canonical Discord `url`, and attachment metadata. Display names prefer the available member nickname, then global name, then username. No attachment is downloaded. Thread evidence includes `id`, `name`, canonical `url`, and observed `archived`/`locked` flags.

| Status | Meaning |
| --- | --- |
| `complete` | The requested interval or lookup scan was exhausted. |
| `partial` | A limit, stalled cursor, incomplete archive, or later failure prevented completion. |
| `denied` | Caller scope or continuation binding was rejected. No evidence is returned. |
| `unavailable` | Discord access, required permissions, client state, or content intent is unavailable. |
| `rate_limited` | The first collection attempt was rate limited. `retryAfterMs` is supplied when known. |
| `failed` | Upstream, validation, or authority-resolution failure. Raw errors are not exposed. |
| `invalid_request` | The request failed validation. No collection occurs. |

A failure after a successful collection page becomes `partial`, with the failure in `coverage.reason`. For lookup, `resolution` is `exact`, `unique`, `ambiguous`, or `empty` only when complete, otherwise `incomplete`. History uses `null`.

Coverage records the validated request without its cursor, call start time, oldest/newest returned creation timestamps, successful page responses, raw messages/thread entries examined, and a next cursor when progress is resumable. Counts are per call, include duplicates and filtered entries, and exclude metadata/permission reads. `intervalExhausted` is true only for `complete`. Reasons include `page_limit`, `message_limit`, `match_limit`, `stalled_cursor`, `archive_incomplete`, and the failure statuses.

## Continuation and consumption

Repeat the same request with `cursor` set to `coverage.nextCursor`. The authenticated, encrypted cursor pins the caller, scope, effective thread grant, query, bounds and limits. Widening or narrowing that grant invalidates the continuation; starting a fresh request uses the current grant. Current grants are checked again. Cursors expire 15 minutes after the initial request and are invalid after the service instance restarts. AES-256-GCM keeps internal scan state private, including boundary IDs for threads outside a thread allowlist. Clients receive only the separately filtered evidence. Altering any bound or using another caller fails closed. A restart requires a fresh bounded request, without a new credential.

History pages scan backward but each response sorts messages chronologically and deduplicates IDs. Across responses, clients merge by ID and sort by creation time and snowflake ID. Retrying a cursor can repeat the same evidence and is safe to deduplicate. Discord edits and deletions can change later reads; cursors are not snapshot isolation.

Lookup accumulates authorized matches across continuations, deduplicates active/archive overlap, overlaps archive timestamp ties, and rechecks active threads after the archive scan. Missing `has_more`, vanished boundary entries, stalled pages and failures never prove absence. A full tied archive page that cannot advance requires a new narrower lookup or exact ID. `complete` describes the observed scan, not permanent absence while Discord changes.

The tests exercise two consumers of the same contract: a chat tool client that preserves the JSON tool response, and a source-reconciliation client that extracts IDs, authors and citations. Neither owns collection, authorization, credentials or model-specific logic. This slice does not implement ingestion or dispatch.

## Verification

Run `pnpm test:thread-read`, `pnpm test`, `pnpm typecheck`, and `pnpm format:check` with the locked dependencies and Node 22. All fixtures are local. The factory is not invoked by the fixture suite, so it cannot access Discord.

Protocol references: [Discord message retrieval and permission behavior](https://docs.discord.com/developers/resources/message#get-channel-messages), [public archive pagination](https://docs.discord.com/developers/resources/channel#list-public-archived-threads), and the existing `hubDelivery/reconcile.ts` boundary-overlap rules.
