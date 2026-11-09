import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPortfolioTools } from "./tools";
import { extractLocation, getVisits, recordVisit } from "./visitors";
import { isRateLimited, sendContactMessage } from "./messages";
import { handleEvent, handleStats, pruneEvents, statsCorsHeaders, tokenMatches, type AnalyticsEnv } from "./analytics";
import { askCorsHeaders, handleAsk, type AssistantEnv } from "./assistant";
import { WEEKLY_DIGEST_CRON, sendWeeklyDigest } from "./digest";

export class PortfolioMCP extends McpAgent {
  server = new McpServer({ name: "ashish-kumar-portfolio", version: "1.0.0" });

  async init() {
    registerPortfolioTools(this.server);
  }
}

type Env = AnalyticsEnv & AssistantEnv & {
  VISITORS: KVNamespace;
  RESEND_API_KEY: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BEACON_PATHS = new Set(["/visit", "/visits", "/message", "/event"]);

export default {
  async fetch(request: Request, env: Env & Record<string, unknown>, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && BEACON_PATHS.has(url.pathname)) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/stats") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: statsCorsHeaders(request) });
      if (request.method === "GET") return handleStats(request, env, Date.now());
    }

    if (url.pathname === "/ask") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: askCorsHeaders(request) });
      if (request.method === "POST") return handleAsk(request, env, Date.now());
    }

    // Sends the weekly analytics digest on demand (same token as /stats).
    if (url.pathname === "/digest" && request.method === "POST") {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
      if (!(await tokenMatches(token, env.STATS_TOKEN))) return new Response(null, { status: 401 });
      const result = await sendWeeklyDigest(env, Date.now());
      return new Response(JSON.stringify(result), { status: result.ok ? 200 : 502, headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/event" && request.method === "POST") {
      return handleEvent(request, env, Date.now());
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

    if (url.pathname === "/message" && request.method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      if (await isRateLimited(env.VISITORS, ip)) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "invalid_json" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      const result = await sendContactMessage(env.RESEND_API_KEY, payload);
      return new Response(JSON.stringify(result.ok ? { ok: true } : { error: result.reason }), {
        status: result.ok ? 200 : result.status,
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

  async scheduled(controller: ScheduledController, env: Env) {
    if (controller.cron === WEEKLY_DIGEST_CRON) {
      await sendWeeklyDigest(env, Date.now());
      return;
    }
    await pruneEvents(env.ANALYTICS, Date.now());
  },
};
