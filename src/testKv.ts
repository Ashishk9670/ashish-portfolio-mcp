import { vi } from "vitest";

// A minimal in-memory stand-in for KVNamespace — get/put are all the code
// under test ever calls. Not the real Workers runtime, but the real contract
// (async get/put, expirationTtl accepted and ignored — tests don't wait out
// a real TTL) for the two modules that use it.
export function createFakeKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    store,
  };
}

export type FakeKv = ReturnType<typeof createFakeKv>;
