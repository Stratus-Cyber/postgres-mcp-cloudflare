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

	/**
	 * Get the organization that owns the OAuth app
	 */
	private async getOAuthAppOrganization(): Promise<string | null> {
		try {
			// Use basic auth with client_id and client_secret to get OAuth app info
			const clientId = (this.env as any).GITHUB_CLIENT_ID;
			const clientSecret = (this.env as any).GITHUB_CLIENT_SECRET;
			
			if (!clientId || !clientSecret) {
				console.error("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not configured");
				return null;
			}

			// Create a basic auth string
			const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
			
			// Get OAuth app information
			const response = await fetch(`https://api.github.com/applications/${clientId}`, {
				headers: {
					'Authorization': `Basic ${auth}`,
					'Accept': 'application/vnd.github.v3+json',
					'User-Agent': 'PostgreSQL-MCP-Server'
				}
			});

			if (!response.ok) {
				console.error(`Failed to get OAuth app info: ${response.status} ${response.statusText}`);
				return null;
			}

			const appData = await response.json() as any;
			
			// Check if the app is owned by an organization
			if (appData.owner && appData.owner.type === 'Organization') {
				return appData.owner.login;
			}
			
			// If owned by a user, we can't use organization membership
			console.warn("OAuth app is owned by a user, not an organization. Wildcard access not supported.");
			return null;
		} catch (error) {
			console.error(`Error getting OAuth app organization: ${error}`);
			return null;
		}
	}

	/**
	 * Check if user has access based on allowed usernames or organization membership
	 */
	private async checkUserAccess(allowedUsernames: Set<string>): Promise<boolean> {
		// Check if user is explicitly listed
		if (allowedUsernames.has(this.props.login)) {
			return true;
		}

		// Check for wildcard access
		if (allowedUsernames.has("*")) {
			try {
				// Get the organization that owns the OAuth app
				const githubOrg = await this.getOAuthAppOrganization();
				if (!githubOrg) {
					console.warn("Wildcard access (*) specified but could not determine OAuth app organization");
					return false;
				}

				const octokit = new Octokit({ auth: this.props.accessToken });
				
				// Check if user is a member of the OAuth app's organization
				try {
					await octokit.rest.orgs.checkMembershipForUser({
						org: githubOrg,
						username: this.props.login,
					});
					// If no error is thrown, user is a public member
					return true;
				} catch (publicCheckError: any) {
					// Status 404 could mean not a member OR private membership
					// Try to get the user's membership status (works for private members too if we have org:read scope)
					try {
						await octokit.rest.orgs.getMembershipForUser({
							org: githubOrg,
							username: this.props.login,
						});
						return true;
					} catch (membershipError) {
						console.log(`User ${this.props.login} is not a member of organization ${githubOrg}`);
						return false;
					}
				}
			} catch (error) {
				console.error(`Error checking organization membership: ${error}`);
				return false;
			}
		}

		return false;
	}

	async init() {
		// Get allowed usernames from environment variable
		const allowedUsernamesStr = (this.env as any).ALLOWED_USERNAMES || "";
		const ALLOWED_USERNAMES = new Set<string>(
			allowedUsernamesStr
				.split(",")
				.map((username: string) => username.trim())
				.filter((username: string) => username.length > 0)
		);

		// Check if user has access - either explicitly listed or wildcard with org membership
		const hasAccess = await this.checkUserAccess(ALLOWED_USERNAMES);

		// Dynamically add tools based on the user's login. In this case, I want to limit
		// access to tools to allowed users only
		if (hasAccess) {
			// Use the upstream access token to facilitate GitHub tools
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
