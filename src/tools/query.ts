import { z } from "zod";
import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolProps {
  pool: pg.Pool;
}

export function Query(server: McpServer, props: ToolProps) {
  server.tool(
    "query",
    "Run a read-only SQL query",
    { sql: z.string().describe("The SQL query to execute") },
    async ({ sql }) => {
      if (!props.pool) {
        throw new Error("Database pool not initialized");
      }

      const client = await props.pool.connect();
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");
        const result = await client.query(sql);
        return {
          content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
        };
      } catch (error) {
        throw new Error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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