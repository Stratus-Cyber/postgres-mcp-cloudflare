import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UserInfoOctokit, type ToolProps as UserInfoToolProps } from "./userInfoOctokit.js";
import { Query, type ToolProps as QueryToolProps } from "./query.js";
import { SteampipeTableShow, type ToolProps as SteampipeTableShowToolProps } from "./steampipe_table_show.js";
import { SteampipeTableList } from "./steampipe_table_list.js";
import { SteampipePluginList } from "./steampipe_plugin_list.js";
import { SteampipePluginShow } from "./steampipe_plugin_show.js";

export interface DatabaseToolsConfig {
  pool: pg.Pool;
}

export interface AuthToolsConfig {
  accessToken: string;
}

// Register GitHub user info tool (for any authenticated user)
export function AuthTools(server: McpServer, config: AuthToolsConfig) {
  UserInfoOctokit(server, { accessToken: config.accessToken });
}

// Register database tools (for authorized users only)
export function DatabaseTools(server: McpServer, config: DatabaseToolsConfig) {
  // Basic SQL query tool
  Query(server, { pool: config.pool });
  
  // Steampipe table tools
  SteampipeTableList(server, { pool: config.pool });
  SteampipeTableShow(server, { pool: config.pool });
  
  // Steampipe plugin tools
  SteampipePluginList(server, { pool: config.pool });
  SteampipePluginShow(server, { pool: config.pool });
}

// Export individual registration functions for granular control
export {
  UserInfoOctokit,
  Query,
  SteampipeTableList,
  SteampipeTableShow,
  SteampipePluginList,
  SteampipePluginShow
}; 