import { z } from "zod";

// Cookieless, aggregate-only analytics. Nothing here stores an IP address, a
// user agent, or a persistent identifier: `session` is a random id the browser
// keeps only in sessionStorage for the life of one tab.

export const EventSchema = z.object({
  type: z.enum(["pageview", "click", "engagement"]),
  path: z.string().min(1).max(200).regex(/^\//),
  session: z.string().regex(/^[a-z0-9-]{8,64}$/i),
  entry: z.boolean().optional(),
  source: z.string().max(200).optional(),
  label: z.string().max(120).optional(),
  target: z.string().max(300).optional(),
  action: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  width: z.number().int().min(0).max(10000).optional(),
  seconds: z.number().int().min(0).max(3600).optional(),
  scroll: z.number().int().min(0).max(100).optional(),
});

export type AnalyticsEvent = z.infer<typeof EventSchema>;

// Actions that count as a visitor reaching out in the recruiter funnel.
export const CONVERSION_ACTIONS = ["resume", "contact", "email", "linkedin", "message"] as const;
export const RETENTION_DAYS = 90;
const MAX_BODY_BYTES = 2048;
const DAY_MS = 86_400_000;

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|playwright|puppeteer|selenium|preview|monitor|curl|wget|python-requests|httpclient/i;

export function isLikelyBot(userAgent: string | null): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}

export function deviceFromWidth(width?: number): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!width) return "unknown";
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$|^linkedin$/, "LinkedIn"],
  [/(^|\.)google\.[a-z.]+$|^google$/, "Google"],
  [/(^|\.)github\.com$|^github$/, "GitHub"],
  [/^(t\.co|x\.com|twitter\.com|x|twitter)$/, "X / Twitter"],
  [/(^|\.)bing\.com$|^bing$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)topmate\.io$|^topmate$/, "Topmate"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai)$/, "AI assistant"],
  [/^mcp$/, "AI assistant (MCP)"],
  [/^resume$/, "Resume PDF"],
];

// `raw` is either a utm_source value or the referring hostname.
export function normalizeSource(raw?: string): string {
  if (!raw) return "Direct";
  const host = raw.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return "Direct";
  for (const [pattern, name] of SOURCES) if (pattern.test(host)) return name;
  return host.slice(0, 60);
}

export async function insertEvent(
  db: D1Database,
  event: AnalyticsEvent,
  meta: { now: number; country?: string }
): Promise<void> {
  const isEntry = event.type === "pageview" && event.entry === true;
  await db
    .prepare(
      `INSERT INTO events (ts, day, type, path, session, label, target, action, source, country, device, seconds, scroll)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      meta.now,
      new Date(meta.now).toISOString().slice(0, 10),
      event.type,
      event.path,
      event.session,
      event.label ?? null,
      event.target ?? null,
      event.action ?? null,
      isEntry ? normalizeSource(event.source) : null,
      meta.country ?? null,
      deviceFromWidth(event.width),
      event.seconds ?? null,
      event.scroll ?? null
    )
    .run();
}

export async function pruneEvents(db: D1Database, now: number, retentionDays = RETENTION_DAYS): Promise<void> {
  await db.prepare("DELETE FROM events WHERE ts < ?").bind(now - retentionDays * DAY_MS).run();
}

type Row = Record<string, string | number | null>;

async function all<T extends Row>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...params).all<T>();
  return results ?? [];
}

const num = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0)) || 0;
const round = (value: unknown) => Math.round(num(value));

export async function getStats(db: D1Database, rangeDays: number, now: number) {
  const since = now - rangeDays * DAY_MS;

  const [totals] = await all(
    db,
    `SELECT SUM(type = 'pageview') AS pageviews,
            COUNT(DISTINCT CASE WHEN type = 'pageview' THEN session END) AS sessions,
            SUM(type = 'click') AS clicks
       FROM events WHERE ts >= ?`,
    since
  );
  const [engagement] = await all(
    db,
    // A page view can flush engagement more than once (tab hidden, then shown
    // again), so time is summed per session+page before averaging.
    `SELECT AVG(total) AS avgSeconds FROM (
       SELECT SUM(seconds) AS total FROM events WHERE type = 'engagement' AND ts >= ? GROUP BY session, path
     )`,
    since
  );

  const dailyRows = await all(
    db,
    `SELECT day, COUNT(*) AS pageviews, COUNT(DISTINCT session) AS sessions
       FROM events WHERE type = 'pageview' AND ts >= ? GROUP BY day`,
    since
  );
  const byDay = new Map(dailyRows.map((r) => [String(r.day), r]));
  const daily = Array.from({ length: rangeDays }, (_, i) => {
    const day = new Date(now - (rangeDays - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    const row = byDay.get(day);
    return { day, pageviews: num(row?.pageviews), sessions: num(row?.sessions) };
  });

  const pageRows = await all(
    db,
    `SELECT path, COUNT(*) AS views, COUNT(DISTINCT session) AS sessions
       FROM events WHERE type = 'pageview' AND ts >= ?
       GROUP BY path ORDER BY views DESC LIMIT 25`,
    since
  );
  const engagementRows = await all(
    db,
    `SELECT path, AVG(total) AS avgSeconds, AVG(depth) AS avgScroll FROM (
       SELECT path, SUM(seconds) AS total, MAX(scroll) AS depth
         FROM events WHERE type = 'engagement' AND ts >= ? GROUP BY session, path
     ) GROUP BY path`,
    since
  );
  const engagementByPath = new Map(engagementRows.map((r) => [String(r.path), r]));
  const pages = pageRows.map((r) => {
    const e = engagementByPath.get(String(r.path));
    return {
      path: String(r.path),
      views: num(r.views),
      sessions: num(r.sessions),
      avgSeconds: e ? round(e.avgSeconds) : null,
      avgScroll: e ? round(e.avgScroll) : null,
    };
  });

  const entries = await all(
    db,
    `SELECT path, COUNT(*) AS sessions FROM events
      WHERE type = 'pageview' AND source IS NOT NULL AND ts >= ?
      GROUP BY path ORDER BY sessions DESC LIMIT 10`,
    since
  );
  const referrers = await all(
    db,
    `SELECT source, COUNT(*) AS sessions FROM events
      WHERE type = 'pageview' AND source IS NOT NULL AND ts >= ?
      GROUP BY source ORDER BY sessions DESC LIMIT 15`,
    since
  );
  const clicks = await all(
    db,
    `SELECT label, target, path, action, COUNT(*) AS clicks FROM events
      WHERE type = 'click' AND ts >= ?
      GROUP BY label, target, path, action ORDER BY clicks DESC LIMIT 30`,
    since
  );
  const keyActions = await all(
    db,
    `SELECT action, COUNT(*) AS clicks, COUNT(DISTINCT session) AS sessions FROM events
      WHERE type = 'click' AND action IS NOT NULL AND ts >= ?
      GROUP BY action ORDER BY clicks DESC`,
    since
  );
  const countries = await all(
    db,
    `SELECT COALESCE(country, 'Unknown') AS country, COUNT(DISTINCT session) AS sessions FROM events
      WHERE type = 'pageview' AND ts >= ? GROUP BY country ORDER BY sessions DESC LIMIT 15`,
    since
  );
  const devices = await all(
    db,
    `SELECT COALESCE(device, 'unknown') AS device, COUNT(DISTINCT session) AS sessions FROM events
      WHERE type = 'pageview' AND ts >= ? GROUP BY device ORDER BY sessions DESC`,
    since
  );

  const conversion = CONVERSION_ACTIONS.map(() => "?").join(", ");
  const [funnel] = await all(
    db,
    `SELECT
       (SELECT COUNT(DISTINCT session) FROM events
         WHERE type = 'pageview' AND path = '/experience' AND ts >= ?) AS viewedDossier,
       (SELECT COUNT(DISTINCT session) FROM events
         WHERE type = 'click' AND action IN (${conversion}) AND ts >= ?) AS reachedOut,
       (SELECT COUNT(DISTINCT session) FROM events
         WHERE type = 'click' AND action IN (${conversion}) AND ts >= ?
           AND session IN (SELECT session FROM events WHERE type = 'pageview' AND path = '/experience' AND ts >= ?)
       ) AS dossierThenReachedOut`,
    since,
    ...CONVERSION_ACTIONS,
    since,
    ...CONVERSION_ACTIONS,
    since,
    since
  );

  return {
    rangeDays,
    generatedAt: new Date(now).toISOString(),
    totals: {
      pageviews: num(totals?.pageviews),
      sessions: num(totals?.sessions),
      clicks: num(totals?.clicks),
      avgSeconds: engagement?.avgSeconds == null ? null : round(engagement.avgSeconds),
    },
    daily,
    pages,
    entries: entries.map((r) => ({ path: String(r.path), sessions: num(r.sessions) })),
    referrers: referrers.map((r) => ({ source: String(r.source), sessions: num(r.sessions) })),
    clicks: clicks.map((r) => ({
      label: r.label == null ? null : String(r.label),
      target: r.target == null ? null : String(r.target),
      path: String(r.path),
      action: r.action == null ? null : String(r.action),
      clicks: num(r.clicks),
    })),
    keyActions: keyActions.map((r) => ({ action: String(r.action), clicks: num(r.clicks), sessions: num(r.sessions) })),
    countries: countries.map((r) => ({ country: String(r.country), sessions: num(r.sessions) })),
    devices: devices.map((r) => ({ device: String(r.device), sessions: num(r.sessions) })),
    funnel: {
      sessions: num(totals?.sessions),
      viewedDossier: num(funnel?.viewedDossier),
      dossierThenReachedOut: num(funnel?.dossierThenReachedOut),
      reachedOut: num(funnel?.reachedOut),
    },
  };
}

export type Stats = Awaited<ReturnType<typeof getStats>>;

// Constant-time comparison of SHA-256 digests, so response timing can't leak
// how much of a guessed token was right.
export async function tokenMatches(given: string | null, expected: string | undefined): Promise<boolean> {
  if (!given || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const STATS_ORIGINS = new Set(["https://ashishk9670.github.io", "http://localhost:3000"]);

export function parseRange(value: string | null): number {
  return value === "7" ? 7 : value === "90" ? 90 : 30;
}

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type AnalyticsEnv = {
  ANALYTICS: D1Database;
  EVENT_LIMITER?: RateLimiter;
  STATS_TOKEN?: string;
};

export async function handleEvent(request: Request, env: AnalyticsEnv, now: number): Promise<Response> {
  const noContent = () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });

  if (isLikelyBot(request.headers.get("user-agent"))) return noContent();

  const ip = request.headers.get("cf-connecting-ip");
  if (env.EVENT_LIMITER && ip) {
    const { success } = await env.EVENT_LIMITER.limit({ key: ip });
    if (!success) return new Response(null, { status: 429, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return new Response(null, { status: 413, headers: { "Access-Control-Allow-Origin": "*" } });

  let parsed: AnalyticsEvent;
  try {
    parsed = EventSchema.parse(JSON.parse(body));
  } catch {
    return new Response(null, { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const country = (request.cf as { country?: string } | undefined)?.country;
  await insertEvent(env.ANALYTICS, parsed, { now, country });
  return noContent();
}

export function statsCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin && STATS_ORIGINS.has(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

export async function handleStats(request: Request, env: AnalyticsEnv, now: number): Promise<Response> {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", ...statsCorsHeaders(request) };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!(await tokenMatches(token, env.STATS_TOKEN))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  }
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  return new Response(JSON.stringify(await getStats(env.ANALYTICS, range, now)), { status: 200, headers });
}
