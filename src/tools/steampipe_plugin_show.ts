import { z } from "zod";
import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolProps {
  pool: pg.Pool;
}

export function SteampipePluginShow(server: McpServer, props: ToolProps) {
  server.tool(
    "steampipe_plugin_show",
    "Get details for a specific Steampipe plugin installation, including version, memory limits, and configuration.",
    {
      name: z.string().describe("Name of the plugin to show details for")
    },
    async ({ name }) => {
      if (!props.pool) {
        throw new Error("Database pool not initialized");
      }

      const client = await props.pool.connect();
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");

        const query = `
          SELECT 
            plugin_instance,
            plugin,
            version,
            memory_max_mb,
            limiters,
            file_name,
            start_line_number,
            end_line_number
          FROM steampipe_plugin
          WHERE plugin = $1
        `;

        const result = await client.query(query, [name]);
        
        if (result.rows.length === 0) {
          return {
            content: [{ type: "text", text: `Plugin '${name}' not found` }],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ plugin: result.rows[0] }, null, 2) }],
        };
      } catch (error) {
        throw new Error(`Failed to get plugin details: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        client
          .query("ROLLBACK")
          .catch((error) =>
            console.warn("Could not roll back transaction:", error),
          );
        client.release();
      }
    }
  );
} 