import { defineConfig } from "vitest/config";

// Plain Node environment, not @cloudflare/vitest-pool-workers: the code under
// test (rate limiting, honeypot validation, Resend calls) only touches
// KVNamespace.get/put, fetch, and crypto.subtle — all mockable directly, so
// the full Workers runtime simulation isn't needed to test it honestly.
export default defineConfig({
  test: {
    environment: "node",
  },
});
