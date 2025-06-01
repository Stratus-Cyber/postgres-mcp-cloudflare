# PostgreSQL Remote Cloudflare MCP Worker

## Get started: 

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Stratus-Cyber/postgres-mcp-cloudflare)

Alternatively, you can use the command line below to get the remote MCP Server created on your local machine:

```bash
npm create cloudflare@latest -- my-mcp-server --template=https://github.com/Stratus-Cyber/postgres-mcp-cloudflare.git
```

> ⚠️ Currently, the `Deploy to Cloudfare` button does not support configuration of evironment variables, the variable must be configured manually, after deployment.

## Environment Variables
From the Cloudflare console > select your Worker AI, go to Settings > Variables and Secrets > +Add 

Type: `Secret` <br>
Variable Name: `DATABASE_URL` <br>
Value: `postgresql://<connection string>`

## Connect to Cloudflare AI Playground

You can connect to your MCP server from the Cloudflare AI Playground, which is a remote MCP client:

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`postgres-mcp-cloudflare.<your-account>.workers.dev/sse`)
3. You can now use your MCP tools directly from the playground!

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
        "http://localhost:8787/sse"  // or remote-mcp-server-authless.<your-account>.workers.dev/sse
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
      "url": "https://postgresql-mcp-cloudflare.<your-account>.workers.dev/sse"
    }
  }
}
```