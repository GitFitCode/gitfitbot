import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { getProjectInitUrl, ProjectInitConfigurationError } from '../utils/projectInit';

const invalidArguments: CallToolResult = {
  isError: true,
  content: [{ type: 'text', text: 'project_init does not accept arguments.' }],
};

async function runProjectInit(): Promise<CallToolResult> {
  try {
    const url = getProjectInitUrl();
    return {
      content: [
        {
          type: 'text',
          text: `Open ${url} in a browser, sign in, then review and save your project setup.`,
        },
      ],
      structuredContent: { url, state: 'requires_browser_sign_in' },
    };
  } catch (error) {
    if (error instanceof ProjectInitConfigurationError)
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Project onboarding is temporarily unavailable. Please contact an administrator.',
          },
        ],
      };
    throw error;
  }
}

export function createProjectInitServer(): Server {
  const server = new Server(
    { name: 'gitfitbot-project-init', version: '1.22.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'project_init',
        description: 'Return the authenticated GitFitCode hub URL for starting project onboarding.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'project_init' || Object.keys(request.params.arguments ?? {}).length > 0)
      return invalidArguments;
    return runProjectInit();
  });
  return server;
}

async function main(): Promise<void> {
  await createProjectInitServer().connect(new StdioServerTransport());
}
if (require.main === module)
  main().catch(() => {
    console.error('project_init MCP server failed to start');
    process.exitCode = 1;
  });
