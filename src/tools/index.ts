import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUserInfoOctokitTool, type ToolProps as UserInfoToolProps } from "./userInfoOctokit.js";
import { registerQueryTool, type ToolProps as QueryToolProps } from "./query.js";
import { registerSteampipeTableShowTool, type ToolProps as SteampipeTableShowToolProps } from "./steampipe_table_show.js";
import { registerSteampipeTableListTool } from "./steampipe_table_list.js";
import { registerSteampipePluginListTool } from "./steampipe_plugin_list.js";
import { registerSteampipePluginShowTool } from "./steampipe_plugin_show.js";

export interface DatabaseToolsConfig {
  pool: pg.Pool;
}

export interface AuthToolsConfig {
  accessToken: string;
}

// Register GitHub user info tool (for any authenticated user)
export function registerAuthTools(server: McpServer, config: AuthToolsConfig) {
  registerUserInfoOctokitTool(server, { accessToken: config.accessToken });
}

// Register database tools (for authorized users only)
export function registerDatabaseTools(server: McpServer, config: DatabaseToolsConfig) {
  // Basic SQL query tool
  registerQueryTool(server, { pool: config.pool });
  
  // Steampipe table tools
  registerSteampipeTableListTool(server, { pool: config.pool });
  registerSteampipeTableShowTool(server, { pool: config.pool });
  
  // Steampipe plugin tools
  registerSteampipePluginListTool(server, { pool: config.pool });
  registerSteampipePluginShowTool(server, { pool: config.pool });
}

// Export individual registration functions for granular control
export {
  registerUserInfoOctokitTool,
  registerQueryTool,
  registerSteampipeTableListTool,
  registerSteampipeTableShowTool,
  registerSteampipePluginListTool,
  registerSteampipePluginShowTool
}; 