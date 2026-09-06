import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPortfolioTools } from "./tools";

export class PortfolioMCP extends McpAgent {
  server = new McpServer({ name: "ashish-kumar-portfolio", version: "1.0.0" });

  async init() {
    registerPortfolioTools(this.server);
  }
}

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return PortfolioMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return PortfolioMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response(
      "Ashish Kumar's portfolio MCP server.\n\nConnect via Streamable HTTP at /mcp, or legacy SSE at /sse.\n\nSource: https://github.com/Ashishk9670/ashish-portfolio-mcp",
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  },
};
