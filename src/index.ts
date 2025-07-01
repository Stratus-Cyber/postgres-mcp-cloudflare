import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitHubHandler } from "./authentication/index.js";
import * as pg from "pg";
import { AuthTools, DatabaseTools } from "./tools/index.js";

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
		// access to all tools to allowed users only
		if (ALLOWED_USERNAMES.has(this.props.login)) {
			// Register GitHub user info tool (only for authorized users)
			AuthTools(this.server, { accessToken: this.props.accessToken });
	  
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

			// Register database tools (only for authorized users)
			DatabaseTools(this.server, { pool: this.pool });
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