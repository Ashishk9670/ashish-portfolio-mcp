import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPortfolioTools } from "./tools";
import { extractLocation, getVisits, recordVisit } from "./visitors";

export class PortfolioMCP extends McpAgent {
  server = new McpServer({ name: "ashish-kumar-portfolio", version: "1.0.0" });

  async init() {
    registerPortfolioTools(this.server);
  }
}

type Env = {
  VISITORS: KVNamespace;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env & Record<string, unknown>, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && (url.pathname === "/visit" || url.pathname === "/visits")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/visit" && request.method === "POST") {
      const cf = request.cf as { latitude?: string; longitude?: string; country?: string; city?: string } | undefined;
      const location = extractLocation(cf);
      if (location) await recordVisit(env.VISITORS, location);
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/visits" && request.method === "GET") {
      const visits = await getVisits(env.VISITORS);
      return new Response(JSON.stringify(visits), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

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
