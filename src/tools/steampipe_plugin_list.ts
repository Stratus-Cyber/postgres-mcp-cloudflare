import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolProps {
  pool: pg.Pool;
}

export function SteampipePluginList(server: McpServer, props: ToolProps) {
  server.tool(
    "steampipe_plugin_list",
    "List all Steampipe plugins installed on the system. Plugins provide access to different data sources like AWS, GCP, or Azure.",
    {},
    async () => {
      if (!props.pool) {
        throw new Error("Database pool not initialized");
      }

      const client = await props.pool.connect();
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");

        const query = `
          SELECT 
            plugin,
            version
          FROM steampipe_plugin
          ORDER BY plugin
        `;

        const result = await client.query(query);
        return {
          content: [{ type: "text", text: JSON.stringify({ plugins: result.rows }, null, 2) }],
        };
      } catch (error) {
        throw new Error(`Failed to list plugins: ${error instanceof Error ? error.message : 'Unknown error'}`);
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