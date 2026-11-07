import { describe, it, expect, beforeEach } from "vitest";
import {
  deviceFromWidth,
  getStats,
  handleEvent,
  handleStats,
  insertEvent,
  isLikelyBot,
  normalizeSource,
  parseRange,
  pruneEvents,
  tokenMatches,
  type AnalyticsEvent,
} from "./analytics";
import { createTestD1 } from "./testD1";

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const DAY = 86_400_000;
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const pageview = (session: string, path: string, extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  type: "pageview",
  path,
  session,
  width: 1440,
  ...extra,
});

function eventRequest(body: unknown, init: { ua?: string | null; ip?: string } = {}) {
  const headers = new Headers({ "content-type": "text/plain" });
  if (init.ua !== null) headers.set("user-agent", init.ua ?? CHROME_UA);
  if (init.ip) headers.set("cf-connecting-ip", init.ip);
  return new Request("https://worker.test/event", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("classification helpers", () => {
  it("flags crawlers, headless browsers, and missing user agents as bots", () => {
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("Googlebot/2.1")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 HeadlessChrome/130.0")).toBe(true);
    expect(isLikelyBot(CHROME_UA)).toBe(false);
  });

  it("buckets devices by viewport width", () => {
    expect(deviceFromWidth(390)).toBe("mobile");
    expect(deviceFromWidth(800)).toBe("tablet");
    expect(deviceFromWidth(1440)).toBe("desktop");
    expect(deviceFromWidth(undefined)).toBe("unknown");
  });

  it("normalizes referrers and utm sources into readable channels", () => {
    expect(normalizeSource(undefined)).toBe("Direct");
    expect(normalizeSource("www.linkedin.com")).toBe("LinkedIn");
    expect(normalizeSource("lnkd.in")).toBe("LinkedIn");
    expect(normalizeSource("linkedin")).toBe("LinkedIn");
    expect(normalizeSource("www.google.co.in")).toBe("Google");
    expect(normalizeSource("github.com")).toBe("GitHub");
    expect(normalizeSource("t.co")).toBe("X / Twitter");
    expect(normalizeSource("chatgpt.com")).toBe("AI assistant");
    expect(normalizeSource("mcp")).toBe("AI assistant (MCP)");
    expect(normalizeSource("resume")).toBe("Resume PDF");
    expect(normalizeSource("topmate")).toBe("Topmate");
    expect(normalizeSource("news.ycombinator.com")).toBe("news.ycombinator.com");
  });

  it("defaults the stats range to 30 days", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("365")).toBe(30);
    expect(parseRange(null)).toBe(30);
  });
});

describe("handleEvent", () => {
  let db: D1Database;
  beforeEach(() => {
    db = createTestD1();
  });

  it("stores a valid pageview with country and device, but no IP or user agent", async () => {
    const res = await handleEvent(
      eventRequest(pageview("sess-0001", "/", { entry: true, source: "www.linkedin.com", width: 390 }), {
        ip: "203.0.113.7",
      }),
      { ANALYTICS: db },
      NOW
    );
    expect(res.status).toBe(204);

    const { results } = await db.prepare("SELECT * FROM events").bind().all<Record<string, unknown>>();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ path: "/", source: "LinkedIn", device: "mobile", day: "2026-10-24" });
    expect(JSON.stringify(results[0])).not.toContain("203.0.113.7");
    expect(JSON.stringify(results[0])).not.toContain("Chrome");
  });

  it("only records a traffic source on the session's entry pageview", async () => {
    await handleEvent(eventRequest(pageview("sess-0002", "/about", { source: "github.com" })), { ANALYTICS: db }, NOW);
    const row = await db.prepare("SELECT source FROM events").bind().first<{ source: string | null }>();
    expect(row?.source).toBeNull();
  });

  it("silently drops bot traffic without storing it", async () => {
    const res = await handleEvent(eventRequest(pageview("sess-0003", "/"), { ua: "Googlebot/2.1" }), { ANALYTICS: db }, NOW);
    expect(res.status).toBe(204);
    const row = await db.prepare("SELECT COUNT(*) AS n FROM events").bind().first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("rejects malformed or invalid payloads", async () => {
    expect((await handleEvent(eventRequest("{not json"), { ANALYTICS: db }, NOW)).status).toBe(400);
    expect((await handleEvent(eventRequest({ type: "purchase", path: "/", session: "sess-0004" }), { ANALYTICS: db }, NOW)).status).toBe(400);
    expect((await handleEvent(eventRequest(pageview("bad id!", "/")), { ANALYTICS: db }, NOW)).status).toBe(400);
    expect((await handleEvent(eventRequest(pageview("sess-0005", "no-leading-slash")), { ANALYTICS: db }, NOW)).status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    const res = await handleEvent(eventRequest(pageview("sess-0006", "/", { label: "x".repeat(3000) })), { ANALYTICS: db }, NOW);
    expect(res.status).toBe(413);
  });

  it("returns 429 when the per-client rate limit is exceeded", async () => {
    const limiter = { limit: async () => ({ success: false }) };
    const res = await handleEvent(eventRequest(pageview("sess-0007", "/"), { ip: "198.51.100.1" }), { ANALYTICS: db, EVENT_LIMITER: limiter }, NOW);
    expect(res.status).toBe(429);
  });
});

describe("getStats", () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestD1();
    const at = (daysAgo: number) => ({ now: NOW - daysAgo * DAY, country: "IN" });
    // Session A: LinkedIn → dossier → resume download.
    await insertEvent(db, pageview("sess-aaaa", "/", { entry: true, source: "linkedin.com" }), at(1));
    await insertEvent(db, pageview("sess-aaaa", "/experience"), at(1));
    await insertEvent(db, { type: "click", path: "/experience", session: "sess-aaaa", label: "Resume (PDF)", target: "/resume.pdf", action: "resume" }, at(1));
    // Two engagement flushes for one view (tab hidden, then shown again) count as one 90s visit.
    await insertEvent(db, { type: "engagement", path: "/experience", session: "sess-aaaa", seconds: 60, scroll: 50 }, at(1));
    await insertEvent(db, { type: "engagement", path: "/experience", session: "sess-aaaa", seconds: 30, scroll: 80 }, at(1));
    // Session B: Google → projects, clicks a repo link, no conversion.
    await insertEvent(db, pageview("sess-bbbb", "/projects", { entry: true, source: "www.google.com", width: 390 }), { now: NOW, country: "US" });
    await insertEvent(db, { type: "click", path: "/projects", session: "sess-bbbb", label: "Repository", target: "github.com/Ashishk9670/x", action: "repo" }, { now: NOW, country: "US" });
    // Session C: direct, emails without visiting the dossier.
    await insertEvent(db, pageview("sess-cccc", "/contact", { entry: true }), at(2));
    await insertEvent(db, { type: "click", path: "/contact", session: "sess-cccc", label: "Email", target: "mailto", action: "email" }, at(2));
    // Outside a 7-day window.
    await insertEvent(db, pageview("sess-old1", "/", { entry: true }), at(20));
  });

  it("totals pageviews, sessions, and clicks within the range", async () => {
    const stats = await getStats(db, 7, NOW);
    expect(stats.totals).toEqual({ pageviews: 4, sessions: 3, clicks: 3, avgSeconds: 90 });
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily.at(-1)).toEqual({ day: "2026-10-24", pageviews: 1, sessions: 1 });
    expect((await getStats(db, 30, NOW)).totals.sessions).toBe(4);
  });

  it("ranks pages and attaches engagement", async () => {
    const { pages } = await getStats(db, 7, NOW);
    expect(pages.find((p) => p.path === "/experience")).toEqual({
      path: "/experience",
      views: 1,
      sessions: 1,
      avgSeconds: 90,
      avgScroll: 80,
    });
  });

  it("reports entry pages, referrer channels, countries, and devices", async () => {
    const stats = await getStats(db, 7, NOW);
    expect(stats.entries).toEqual(expect.arrayContaining([{ path: "/", sessions: 1 }, { path: "/projects", sessions: 1 }]));
    expect(stats.referrers).toEqual(
      expect.arrayContaining([{ source: "LinkedIn", sessions: 1 }, { source: "Google", sessions: 1 }, { source: "Direct", sessions: 1 }])
    );
    expect(stats.countries[0]).toEqual({ country: "IN", sessions: 2 });
    expect(stats.devices).toEqual(expect.arrayContaining([{ device: "mobile", sessions: 1 }, { device: "desktop", sessions: 2 }]));
  });

  it("builds the recruiter funnel from dossier views and outreach clicks", async () => {
    const { funnel, keyActions } = await getStats(db, 7, NOW);
    expect(funnel).toEqual({ sessions: 3, viewedDossier: 1, dossierThenReachedOut: 1, reachedOut: 2 });
    expect(keyActions.map((a) => a.action).sort()).toEqual(["email", "repo", "resume"]);
  });
});

describe("retention", () => {
  it("deletes events older than the retention window", async () => {
    const db = createTestD1();
    await insertEvent(db, pageview("sess-old2", "/"), { now: NOW - 91 * DAY });
    await insertEvent(db, pageview("sess-new2", "/"), { now: NOW - 89 * DAY });
    await pruneEvents(db, NOW);
    const { results } = await db.prepare("SELECT session FROM events").bind().all<{ session: string }>();
    expect(results.map((r) => r.session)).toEqual(["sess-new2"]);
  });
});

describe("stats access", () => {
  it("matches only the exact token", async () => {
    expect(await tokenMatches("secret-token", "secret-token")).toBe(true);
    expect(await tokenMatches("secret-tokem", "secret-token")).toBe(false);
    expect(await tokenMatches(null, "secret-token")).toBe(false);
    expect(await tokenMatches("anything", undefined)).toBe(false);
  });

  it("returns 401 without a valid bearer token and stats with one", async () => {
    const db = createTestD1();
    const req = (auth?: string) =>
      new Request("https://worker.test/stats?range=7", {
        headers: { origin: "https://ashishk9670.github.io", ...(auth ? { authorization: auth } : {}) },
      });
    const env = { ANALYTICS: db, STATS_TOKEN: "secret-token" };

    const denied = await handleStats(req("Bearer nope"), env, NOW);
    expect(denied.status).toBe(401);

    const ok = await handleStats(req("Bearer secret-token"), env, NOW);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://ashishk9670.github.io");
    expect(((await ok.json()) as { rangeDays: number }).rangeDays).toBe(7);
  });

  it("does not grant CORS access to unknown origins", async () => {
    const res = await handleStats(
      new Request("https://worker.test/stats", { headers: { origin: "https://evil.example", authorization: "Bearer x" } }),
      { ANALYTICS: createTestD1(), STATS_TOKEN: "x" },
      NOW
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
