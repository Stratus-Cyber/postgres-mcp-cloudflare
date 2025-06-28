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
	 * Check if user is a member of a specific organization (works for private memberships)
	 */
	private async checkOrganizationMembership(orgName: string): Promise<boolean> {
		try {
			const octokit = new Octokit({ auth: this.props.accessToken });
			
			// Try to get the user's membership in the specific organization
			// This works even for private memberships when using the user's own token
			await octokit.rest.orgs.getMembershipForAuthenticatedUser({
				org: orgName
			});
			
			return true;
		} catch (error: any) {
			// 404 means user is not a member of the organization
			if (error.status === 404) {
				console.log(`User ${this.props.login} is not a member of organization: ${orgName}`);
				return false;
			}
			
			console.error(`Error checking membership for organization ${orgName}: ${error}`);
			return false;
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

		// Check for wildcard access - grants access to users in allowed organizations
		if (allowedUsernames.has("*")) {
			try {
				// Get allowed organizations from environment variable
				const allowedOrgsStr = (this.env as any).GITHUB_ALLOWED_ORGANIZATIONS || "";
				const allowedOrgs = new Set<string>(
					allowedOrgsStr
						.split(",")
						.map((org: string) => org.trim())
						.filter((org: string) => org.length > 0)
				);

				// If no organizations specified, deny access
				if (allowedOrgs.size === 0) {
					console.warn("Wildcard access (*) specified but GITHUB_ALLOWED_ORGANIZATIONS not configured");
					return false;
				}

				console.log(`Debug: Checking user ${this.props.login} against allowed organizations: [${Array.from(allowedOrgs).join(', ')}]`);
				
				// Check if user belongs to any allowed organization
				for (const orgName of allowedOrgs) {
					console.log(`Debug: Checking membership in organization: ${orgName}`);
					const isMember = await this.checkOrganizationMembership(orgName);
					
					if (isMember) {
						console.log(`User ${this.props.login} granted access via organization: ${orgName}`);
						return true;
					}
				}

				console.log(`User ${this.props.login} is not a member of any allowed organizations: ${Array.from(allowedOrgs).join(', ')}`);
				return false;
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
