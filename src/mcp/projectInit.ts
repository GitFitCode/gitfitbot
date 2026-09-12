import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getProjectInitUrl, ProjectInitConfigurationError } from '../utils/projectInit';

export function createProjectInitServer(): McpServer {
  const server = new McpServer({ name: 'gitfitbot-project-init', version: '1.22.0' });
  server.registerTool(
    'project_init',
    {
      description: 'Return the authenticated GitFitCode hub URL for starting project onboarding.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    } as never,
    async () => {
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
    },
  );
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
