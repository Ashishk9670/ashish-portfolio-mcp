# ashish-portfolio-mcp

An MCP (Model Context Protocol) server that exposes [Ashish Kumar's portfolio](https://ashishk9670.github.io/portfolio/) — experience, projects, skills, and writing — as structured tools any MCP-aware AI client can query, instead of scraping HTML.

**Live:** `https://ashish-portfolio-mcp.ashishk.workers.dev/mcp` (Streamable HTTP) or `/sse` (legacy SSE). No install needed — point any MCP client at the URL.

Built as a companion to the portfolio site itself: [`ashishk9670/portfolio`](https://github.com/Ashishk9670/portfolio) exports its data as static JSON at build time (`public/data/*.json`), and this server fetches that JSON at request time. Same source of truth, two deploys, no duplicated resume data.

## Tools

| Tool | Description |
|---|---|
| `get_experience` | Work history with quantified results and business impact per role |
| `get_projects` | Project case studies (problem, approach, results, outcome, impact) |
| `get_skills` | Skills by category, plus the tools actually used and why |
| `get_about` | Career timeline, engineering philosophy, education, certifications |
| `get_contact_info` | Email, GitHub, LinkedIn, and current availability status |
| `list_blog_posts` | Blog post titles, descriptions, and dates |
| `get_blog_post` | Full Markdown content of one post, by slug |

## Architecture

- **Remote (primary):** a Cloudflare Worker using [`agents/mcp`](https://github.com/cloudflare/agents)'s `McpAgent`, serving Streamable HTTP at `/mcp` and legacy SSE at `/sse`. No local install needed — just a URL.
- **Local (stdio):** a bundled Node script (`bin/stdio.js`) for Claude Desktop/Code, built with `npm run build:stdio`.
- Both share the exact same tool implementations (`src/tools.ts`) and data-fetching layer (`src/data.ts`), which validates every fetched JSON payload with Zod (`src/schemas.ts`) before handing it to a tool.
- Responses are cached at Cloudflare's edge for 5 minutes (`cf: { cacheTtl }`), so pushing new data to the portfolio site propagates here automatically — no redeploy of this server required.

This is a read-only, public-information-only server — everything it returns is already public on the portfolio site. No auth, no write access, no PII beyond what's already published.

## Local development

```bash
npm install
npm run dev          # wrangler dev, served at http://localhost:8787
```

Test it with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) CLI:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --method tools/list
npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --method tools/call --tool-name get_contact_info
```

## Redeploying

Already live at `https://ashish-portfolio-mcp.ashishk.workers.dev`. To ship a change:

```bash
npx wrangler login     # one-time, opens a browser to authenticate with your Cloudflare account
npm run deploy
```

To connect Claude Code or Claude Desktop to it, add it as a remote MCP server pointing at `https://ashish-portfolio-mcp.ashishk.workers.dev/mcp`.

## Using it locally via stdio

```bash
npm run build:stdio
node bin/stdio.js     # speaks MCP over stdio
```

Or add it to Claude Desktop's config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ashish-portfolio": {
      "command": "node",
      "args": ["/absolute/path/to/ashish-portfolio-mcp/bin/stdio.js"]
    }
  }
}
```

Once published to npm, this collapses to `npx ashish-portfolio-mcp` — see `prepublishOnly` in `package.json`, which builds `bin/stdio.js` automatically before `npm publish`. Publishing itself needs `npm login` with your own npm account; this repo doesn't do that step for you.

## Why this exists

The portfolio's whole pitch is "AI-assisted tooling used deliberately, not as hype." This is the concrete version of that: instead of a recruiter's AI assistant scraping the site's HTML, it can call `get_experience` or `get_projects` and get the same structured data the site itself renders from — accurate, current, and machine-readable by design.
