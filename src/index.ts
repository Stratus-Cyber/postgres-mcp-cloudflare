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
	  
		  // Dynamically add tools based on the user's login. In this case, I want to limit
		  // access to my PostgreSQL tool to allowed users
		  if (ALLOWED_USERNAMES.has(this.props.login)) {
			this.pool = new pg.Pool({
				connectionString: (this.env as any).DATABASE_URL,
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

// export default {
// 	fetch(request: Request, env: Env, ctx: ExecutionContext) {
// 		const url = new URL(request.url);

// 		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
// 			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
// 		}

// 		if (url.pathname === "/mcp") {
// 			return MyMCP.serve("/mcp").fetch(request, env, ctx);
// 		}

// 		return new Response("Not found", { status: 404 });
// 	},
// };
