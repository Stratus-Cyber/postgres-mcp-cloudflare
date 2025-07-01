import { z } from "zod";
import * as pg from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolProps {
  pool: pg.Pool;
}

export function SteampipeTableShow(server: McpServer, props: ToolProps) {
  server.tool(
    "steampipe_table_show",
    "Get detailed information about a specific Steampipe table, including column definitions, data types, and descriptions.",
    {
      name: z.string().describe("The name of the table to show details for. Can be schema qualified (e.g. 'aws_account' or 'aws.aws_account')."),
      schema: z.string().optional().describe("Optional schema name. If provided, only searches in this schema. If not provided, searches across all schemas.")
    },
    async ({ name, schema }) => {
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
          SELECT 
            t.table_schema as schema,
            t.table_name as name,
            t.table_type as type,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            col_description(format('%I.%I', t.table_schema, t.table_name)::regclass::oid, c.ordinal_position) as description
          FROM information_schema.tables t
          LEFT JOIN information_schema.columns c 
            ON c.table_schema = t.table_schema 
            AND c.table_name = t.table_name
          WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog')
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (schema) {
          query += ` AND t.table_schema = $${paramIndex}`;
          params.push(schema);
          paramIndex++;
        }

        query += ` AND t.table_name = $${paramIndex}`;
        params.push(name);

        query += " ORDER BY c.ordinal_position";

        const result = await client.query(query, params);
        if (result.rows.length === 0) {
          return {
            content: [{ type: "text", text: `Table '${name}' not found${schema ? ` in schema '${schema}'` : ''}` }],
          };
        }

        // Format the result into table and columns structure
        const table = {
          schema: result.rows[0].schema,
          name: result.rows[0].name,
          type: result.rows[0].type,
          columns: result.rows.map(row => ({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
            default: row.column_default,
            ...(row.character_maximum_length && { character_maximum_length: row.character_maximum_length }),
            ...(row.numeric_precision && { numeric_precision: row.numeric_precision }),
            ...(row.numeric_scale && { numeric_scale: row.numeric_scale }),
            ...(row.description && { description: row.description })
          }))
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ table }, null, 2) }],
        };
      } catch (error) {
        throw new Error(`Failed to get table details: ${error instanceof Error ? error.message : 'Unknown error'}`);
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