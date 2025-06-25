# PostgreSQL Remote Cloudflare MCP Worker
Remote Cloudflare MCP Worker for PostgreSQL with GitHub authentication.

## Get started: 
[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Stratus-Cyber/postgres-mcp-cloudflare)

Alternatively, you can use the command line below to get the remote MCP Server created on your local machine:

```bash
npm create cloudflare@latest -- my-mcp-server --template=https://github.com/Stratus-Cyber/postgres-mcp-cloudflare.git
```
## GitHub OAuth Application
Create a <u>GitHub OAuth App</u> for Authentication. <br>
From GitHub > Settings > Developer Settings > [OAuth Apps](https://github.com/settings/apps) > Select <b>New GitHub App</b> <br><br>
<b>Homepage URL</b>: `https://postgres-mcp-cloudflare.<your-account>.workers.dev`<br>
<b>Callback URL</b>: `https://postgres-mcp-cloudflare.<your-account>.workers.dev/callback` <br>

## Environment Variables
After deployment of the MCP Server, update the Environment Variables from the Cloudflare console > select your Worker AI, go to Settings > Variables and Secrets

| Variable Name | Recommended Type | Description | Example Value |
|---------------|------|-------------|---------------|
| `DATABASE_URL` | Secret | PostgreSQL connection string | `postgresql://user:password@host:5432/database` |
| `GITHUB_CLIENT_ID` | Secret | GitHub OAuth App Client ID | `your_github_client_id` |
| `GITHUB_CLIENT_SECRET` | Secret | GitHub OAuth App Client Secret | `your_github_client_secret` |
| `COOKIE_ENCRYPTION_KEY` | Secret | Random key for cookie encryption `openssl rand -hex 32` | `your_random_32_char_key` |
| `ALLOWED_USERNAMES` | Text | Comma-separated GitHub usernames | `user1,user2,user3` |

## Connect to Cloudflare AI Playground

You can connect to your MCP server from the Cloudflare AI Playground, which is a remote MCP client:

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`postgres-mcp-cloudflare.<your-account>.workers.dev/sse`)
3. Authenticate to GitHub
4. You can now use your MCP tools directly from the playground!

## Connect Claude Desktop to your MCP server

You can also connect to your remote MCP server from local MCP clients, by using the [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote). 

To connect to your MCP server from Claude Desktop, follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Update with this configuration:

```json
{
  "mcpServers": {
    "calculator": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"  // or https://postgres-mcp-cloudflare.<your-account>.workers.dev/sse
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available. 

## Connect Cursor AI to your MCP server

On Mac OS, go to Cursor > Settings > Cursor Settings > MCP > Add new Global MCP Server > edit the `mcp.json` file

```json
{
  "mcpServers": {
    "postgresql-remote-mcp": {
      "url": "https://postgres-mcp-cloudflare.<your-account>.workers.dev/sse"
    }
  }
}
```

## Troubleshooting

Issue: `proxy request failed, cannot connect to the specified address`

Solution: Validate your postgresql connection string is correct.