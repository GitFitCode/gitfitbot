import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from 'discord.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import Project from '../src/commands/Project';
import { handleSlashCommand } from '../src/listeners/interactionDispatcher';
import { handleModalSubmission } from '../src/listeners/modalDispatcher';
import { getProjectInitUrl, ProjectInitConfigurationError } from '../src/utils/projectInit';

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
  const replies: unknown[] = [];
  const interaction = {
    commandName: 'project',
    guildId: 'guild-1',
    deferred: false,
    replied: false,
    options: { getSubcommand: () => 'init' },
    reply: async (value: unknown) => replies.push(value),
    deferReply: async () => assert.fail('must not defer'),
    editReply: async () => assert.fail('must not edit'),
  };
  const original = process.env.GFC_PROJECT_HUB_ORIGIN;
  process.env.GFC_PROJECT_HUB_ORIGIN = 'https://hub.gitfitcode.org';
  try {
    await handleSlashCommand({} as Client, interaction as never, [Project]);
  } finally {
    process.env.GFC_PROJECT_HUB_ORIGIN = original;
  }
  assert.equal(replies.length, 1);
  assert.equal((replies[0] as { ephemeral: boolean }).ephemeral, true);
  assert.match((replies[0] as { content: string }).content, /sign in, review, and save/);
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

test('MCP stdio handshake lists and calls the read-only project_init tool', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['-r', 'ts-node/register', 'src/mcp/projectInit.ts'],
    cwd: process.cwd(),
    env: { ...process.env, GFC_PROJECT_HUB_ORIGIN: 'https://hub.gitfitcode.org' } as Record<
      string,
      string
    >,
  });
  const client = new McpClient({ name: 'project-init-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools[0].name, 'project_init');
    assert.equal(tools.tools[0].annotations?.readOnlyHint, true);
    const result = await client.callTool({ name: 'project_init', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.match(
      (result as unknown as { content: { text: string }[] }).content[0].text,
      /https:\/\/hub\.gitfitcode\.org\/projects\/new/,
    );
    const bad = await client.callTool({ name: 'project_init', arguments: { identity: 'nope' } });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
  }
});
