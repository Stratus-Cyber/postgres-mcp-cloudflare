import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUserInfoOctokitTool } from "./userInfoOctokit.js";
import { registerQueryTool } from "./query.js";
import { registerSteampipeTableShowTool } from "./steampipe_table_show.js";

export interface ToolsConfig {
  accessToken: string;
  pool: pg.Pool;
}

export function registerAllTools(server: McpServer, config: ToolsConfig) {
  // Register GitHub user info tool (always available for authenticated users)
  registerUserInfoOctokitTool(server, { accessToken: config.accessToken });
  
  // Register database tools (only available if pool is provided)
  if (config.pool) {
    registerQueryTool(server, { pool: config.pool });
    registerSteampipeTableShowTool(server, { pool: config.pool });
  }
}

// Export individual registration functions for granular control
export {
  registerUserInfoOctokitTool,
  registerQueryTool,
  registerSteampipeTableShowTool
}; 