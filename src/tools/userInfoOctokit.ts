import { Octokit } from "octokit";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolProps {
  accessToken: string;
}

export function UserInfoOctokit(server: McpServer, props: ToolProps) {
  server.tool(
    "userInfoOctokit", 
    "Get user info from GitHub, via Octokit", 
    {}, 
    async () => {
      const octokit = new Octokit({ auth: props.accessToken });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await octokit.rest.users.getAuthenticated()),
          },
        ],
      };
    }
  );
} 