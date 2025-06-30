import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Octokit } from "octokit";
import { GitHubHandler } from "./github-handler";
import * as pg from "pg";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
};

export class MyMCP extends McpAgent<Env, {}, Props> {
	server = new McpServer({
		name: "PostgreSQL Remote MCP Server with OAuth",
		version: "1.0.0",
	});
	
	private pool: pg.Pool | null = null;
	private resourceBaseUrl: URL | null = null;
	private readonly SCHEMA_PATH = "schema";

	async init() {
		// Get allowed usernames from environment variable
		const allowedUsernamesStr = (this.env as any).ALLOWED_USERNAMES || "";
		const ALLOWED_USERNAMES = new Set<string>(
			allowedUsernamesStr
				.split(",")
				.map((username: string) => username.trim())
				.filter((username: string) => username.length > 0)
		);
	  
		  // Dynamically add tools based on the user's login. In this case, I want to limit
		  // access to my PostgreSQL tool to allowed users
		  if (ALLOWED_USERNAMES.has(this.props.login)) {
			this.pool = new pg.Pool({
				connectionString: (this.env as any).DATABASE_URL,
			});
			
			// Use the upstream access token to facilitate tools
			this.server.tool("userInfoOctokit", "Get user info from GitHub, via Octokit", {}, async () => {
				const octokit = new Octokit({ auth: this.props.accessToken });
				return {
				content: [
					{
					type: "text",
					text: JSON.stringify(await octokit.rest.users.getAuthenticated()),
					},
				],
				};
			});

			// Set up resource base URL for schema resources
			if ((this.env as any).DATABASE_URL) {
				this.resourceBaseUrl = new URL((this.env as any).DATABASE_URL);
				this.resourceBaseUrl.protocol = "postgres:";
				this.resourceBaseUrl.password = "";
			}

			// Note: Resources are not implemented in this version as the McpAgent framework
			// has different resource API requirements. Using tools instead for database inspection.

			// Query tool for running read-only SQL queries
			this.server.tool(
				"query",
				"Run a read-only SQL query",
				{ sql: z.string().describe("The SQL query to execute") },
				async ({ sql }) => {
					if (!this.pool) {
						throw new Error("Database pool not initialized");
					}
					
						const client = await this.pool.connect();
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

			// Steampipe table show tool - get detailed table information
			this.server.tool(
				"steampipe_table_show",
				"Get detailed information about a specific Steampipe table, including column definitions, data types, and descriptions.",
				{
					name: z.string().describe("The name of the table to show details for. Can be schema qualified (e.g. 'aws_account' or 'aws.aws_account')."),
					schema: z.string().optional().describe("Optional schema name. If provided, only searches in this schema. If not provided, searches across all schemas.")
				},
				async ({ name, schema }) => {
					if (!this.pool) {
						throw new Error("Database pool not initialized");
					}

					const client = await this.pool.connect();
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
	}
}

export default new OAuthProvider({
	apiRoute: "/sse",
	apiHandler: MyMCP.mount("/sse") as any,
	defaultHandler: GitHubHandler as any,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
  });
