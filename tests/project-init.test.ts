import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from 'discord.js';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import Project from '../src/commands/Project';
import Standup from '../src/commands/Standup';
import { handleSlashCommand } from '../src/listeners/interactionDispatcher';
import { handleModalSubmission } from '../src/listeners/modalDispatcher';
import { getProjectInitUrl, ProjectInitConfigurationError } from '../src/utils/projectInit';

type Reply = { ephemeral?: boolean; content?: string; components?: unknown[] };

async function withProjectHubOrigin<T>(
  origin: string | undefined,
  callback: () => Promise<T> | T,
): Promise<T> {
  const previous = process.env.GFC_PROJECT_HUB_ORIGIN;
  if (origin === undefined) delete process.env.GFC_PROJECT_HUB_ORIGIN;
  else process.env.GFC_PROJECT_HUB_ORIGIN = origin;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.GFC_PROJECT_HUB_ORIGIN;
    else process.env.GFC_PROJECT_HUB_ORIGIN = previous;
  }
}

function projectInteraction(overrides: Record<string, unknown> = {}) {
  const replies: Reply[] = [];
  let deferred = false;
  let replied = false;
  return {
    replies,
    interaction: {
      commandName: 'project',
      guildId: 'guild-1',
      get deferred() {
        return deferred;
      },
      get replied() {
        return replied;
      },
      options: { getSubcommand: () => 'init' },
      reply: async (value: Reply) => {
        replied = true;
        replies.push(value);
      },
      deferReply: async () => {
        deferred = true;
      },
      editReply: async () => assert.fail('must not edit'),
      ...overrides,
    },
  };
}

test('accepts only safe configured hub origins', () => {
  assert.equal(
    getProjectInitUrl('https://hub.gitfitcode.org'),
    'https://hub.gitfitcode.org/projects/new',
  );
  assert.equal(getProjectInitUrl('http://localhost:3000'), 'http://localhost:3000/projects/new');
  for (const origin of [
    '',
    'http://hub.gitfitcode.org',
    'https://user:pass@hub.gitfitcode.org',
    'https://hub.gitfitcode.org/path',
    'https://hub.gitfitcode.org?token=x',
    'https://hub.gitfitcode.org#token',
  ])
    assert.throws(() => getProjectInitUrl(origin), ProjectInitConfigurationError);
});

test('actual slash dispatcher gives /project init an ephemeral first response', async () => {
  const { interaction, replies } = projectInteraction();
  await withProjectHubOrigin('https://hub.gitfitcode.org', () =>
    handleSlashCommand({} as Client, interaction as never, [Project]),
  );
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ephemeral, true);
  assert.match(replies[0].content!, /sign in, review, and save/);
  assert.match(
    JSON.stringify(replies[0].components),
    /https:\/\/hub\.gitfitcode\.org\/projects\/new/,
  );
});

test('actual slash dispatcher safely rejects project missing or invalid configuration', async () => {
  for (const origin of [undefined, 'https://hub.gitfitcode.org/not-an-origin']) {
    const { interaction, replies } = projectInteraction();
    await withProjectHubOrigin(origin, () =>
      handleSlashCommand({} as Client, interaction as never, [Project]),
    );
    assert.deepEqual(replies, [
      {
        ephemeral: true,
        content: 'Project onboarding is temporarily unavailable. Please contact an administrator.',
      },
    ]);
  }
});

test('actual slash dispatcher rejects non-guild and unsupported project actions ephemerally', async () => {
  for (const overrides of [{ guildId: null }, { options: { getSubcommand: () => 'other' } }]) {
    const { interaction, replies } = projectInteraction(overrides);
    await handleSlashCommand({} as Client, interaction as never, [Project]);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].ephemeral, true);
  }
});

test('dispatcher safely reports a command handler exception before acknowledgement', async () => {
  const replies: Reply[] = [];
  const interaction = {
    commandName: 'broken',
    deferred: false,
    replied: false,
    reply: async (value: Reply) => replies.push(value),
    deferReply: async () => assert.fail('must not defer'),
    editReply: async () => assert.fail('must not edit'),
  };
  const originalError = console.error;
  console.error = () => undefined;
  try {
    await handleSlashCommand({} as Client, interaction as never, [
      { name: 'broken', description: 'broken', run: async () => Promise.reject(new Error('boom')) },
    ]);
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(replies, [{ ephemeral: true, content: 'An error has occurred.' }]);
});

test('ordinary commands defer while standup opens its modal without deferring', async () => {
  const deferred: string[] = [];
  await handleSlashCommand(
    {} as Client,
    {
      commandName: 'ordinary',
      deferred: false,
      replied: false,
      deferReply: async () => deferred.push('ordinary'),
      reply: async () => assert.fail('must not reply'),
      editReply: async () => assert.fail('must not edit'),
    } as never,
    [{ name: 'ordinary', description: 'ordinary', run: async () => undefined }],
  );
  const standup = projectInteraction({
    commandName: 'standup',
    showModal: async () => deferred.push('standup'),
  });
  await handleSlashCommand({} as Client, standup.interaction as never, [Standup]);
  assert.deepEqual(deferred, ['ordinary', 'standup']);
});

test('standup modal behavior remains available', async () => {
  const replies: string[] = [];
  await handleModalSubmission({
    customId: 'standupModal',
    user: { id: 'member-1' },
    fields: {
      getTextInputValue: (id: string) =>
        ({ yesterdayInput: 'yesterday', todayInput: 'today', blockersInput: 'none' })[id],
    },
    reply: async (value: string) => replies.push(value),
  } as never);
  assert.match(replies[0], /yesterday/);
});

async function withMcpClient(
  origin: string | undefined,
  callback: (client: McpClient) => Promise<void>,
): Promise<void> {
  assert.equal(existsSync('dist/src/mcp/projectInit.js'), true, 'run pnpm build before this test');
  const {
    DISCORD_BOT_TOKEN: _token,
    BOT_ID: _botId,
    BOT_SECRET: _botSecret,
    ...environment
  } = process.env;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/src/mcp/projectInit.js'],
    cwd: process.cwd(),
    env: Object.fromEntries(
      Object.entries({ ...environment, GFC_PROJECT_HUB_ORIGIN: origin }).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Record<string, string>,
  });
  const client = new McpClient({ name: 'project-init-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    await callback(client);
  } finally {
    await client.close();
  }
}

test('built MCP entry is protocol-clean, read-only, and returns the Discord URL without Discord credentials', async () => {
  await withMcpClient('https://hub.gitfitcode.org', async (client) => {
    const tools = await client.listTools();
    assert.equal(tools.tools[0].name, 'project_init');
    assert.equal(tools.tools[0].annotations?.readOnlyHint, true);
    const result = await client.callTool({ name: 'project_init', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.match(
      (result as unknown as { content: { text: string }[] }).content[0].text,
      /https:\/\/hub\.gitfitcode\.org\/projects\/new/,
    );
    assert.deepEqual((result as unknown as { structuredContent: unknown }).structuredContent, {
      url: 'https://hub.gitfitcode.org/projects/new',
      state: 'requires_browser_sign_in',
    });
    const bad = await client.callTool({ name: 'project_init', arguments: { identity: 'nope' } });
    assert.equal(bad.isError, true);
  });
});

test('built MCP entry returns safe errors for missing and invalid configuration', async () => {
  for (const origin of [undefined, 'https://hub.gitfitcode.org/path'])
    await withMcpClient(origin, async (client) => {
      const result = await client.callTool({ name: 'project_init', arguments: {} });
      assert.equal(result.isError, true);
      assert.deepEqual((result as unknown as { content: { text: string }[] }).content, [
        {
          type: 'text',
          text: 'Project onboarding is temporarily unavailable. Please contact an administrator.',
        },
      ]);
    });
});
