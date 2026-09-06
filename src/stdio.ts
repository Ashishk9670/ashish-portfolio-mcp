import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerPortfolioTools } from "./tools";

async function main() {
  const server = new McpServer({ name: "ashish-kumar-portfolio", version: "1.0.0" });
  registerPortfolioTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start ashish-portfolio-mcp:", error);
  process.exit(1);
});
