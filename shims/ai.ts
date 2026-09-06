// Stub for the optional "ai" (Vercel AI SDK) peer dependency of the `agents`
// package. We only use `agents/mcp`, never the AI-chat-agent features that
// actually call into this package, but esbuild still needs the dynamic
// `import("ai")` inside `agents` to resolve at bundle time. Aliased in via
// wrangler.toml's [alias] table.
export function jsonSchema<T>(schema: T): T {
  return schema;
}
