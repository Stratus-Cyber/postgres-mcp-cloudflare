import { z } from "zod";
import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolProps {
  pool: pg.Pool;
}

export function SteampipeTableList(server: McpServer, props: ToolProps) {
  server.tool(
    "steampipe_table_list",
    "List all available Steampipe tables. Use schema and filter parameters to narrow down results.",
    {
      schema: z.string().optional().describe("Optional schema name to filter tables by. If not provided, lists tables from all schemas."),
      filter: z.string().optional().describe("Optional filter pattern to match against table names. Use ILIKE syntax, including % as a wildcard.")
    },
    async ({ schema, filter }) => {
      if (!props.pool) {
        throw new Error("Database pool not initialized");
      }

      const client = await props.pool.connect();
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");

        // Check if schema exists if specified
        if (schema) {
          const schemaQuery = `
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name = $1
          `;
          const schemaResult = await client.query(schemaQuery, [schema]);
          if (schemaResult.rows.length === 0) {
            return {
              content: [{ type: "text", text: `Schema '${schema}' not found` }],
            };
          }
        }

        // Build the query based on provided arguments
        let query = `
          SELECT DISTINCT 
            table_schema as schema,
            table_name as name,
            obj_description(format('%I.%I', table_schema, table_name)::regclass::oid, 'pg_class') as description
          FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (schema) {
          query += ` AND table_schema = $${paramIndex}`;
          params.push(schema);
          paramIndex++;
        }

        if (filter) {
          query += ` AND table_name ILIKE $${paramIndex}`;
          params.push(filter);
        }

        query += " ORDER BY table_schema, table_name";

        const result = await client.query(query, params);
        return {
          content: [{ type: "text", text: JSON.stringify({ tables: result.rows }, null, 2) }],
        };
      } catch (error) {
        throw new Error(`Failed to list tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
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