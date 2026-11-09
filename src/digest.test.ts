import { describe, it, expect, vi, afterEach } from "vitest";
import { buildDigest, change, escapeHtml, previousWeekTotals, sendWeeklyDigest } from "./digest";
import { getStats, insertEvent } from "./analytics";
import { createTestD1 } from "./testD1";

const NOW = Date.UTC(2026, 10, 9, 3, 30);
const DAY = 86_400_000;

async function seed() {
  const db = createTestD1();
  const at = (d: number) => ({ now: NOW - d * DAY, country: "IN" });
  // This week: two visits, one resume download.
  await insertEvent(db, { type: "pageview", path: "/", session: "sess-this1", entry: true, source: "linkedin" }, at(1));
  await insertEvent(db, { type: "pageview", path: "/experience", session: "sess-this1" }, at(1));
  await insertEvent(db, { type: "click", path: "/experience", session: "sess-this1", label: "Resume (PDF)", action: "resume" }, at(1));
  await insertEvent(db, { type: "pageview", path: "/", session: "sess-this2", entry: true, source: "<script>alert(1)</script>" }, at(2));
  // Last week: one visit.
  await insertEvent(db, { type: "pageview", path: "/", session: "sess-last1", entry: true }, at(9));
  return db;
}

describe("digest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("describes week-over-week change", () => {
    expect(change(12, 10)).toBe("↑ 20% vs last week");
    expect(change(5, 10)).toBe("↓ 50% vs last week");
    expect(change(3, 0)).toBe("new this week");
    expect(change(0, 0)).toBe("no change");
  });

  it("counts only the previous 7-day window for comparison", async () => {
    expect(await previousWeekTotals(await seed(), NOW)).toEqual({ pageviews: 1, sessions: 1 });
  });

  it("summarizes the week, key actions, funnel, and sources", async () => {
    const db = await seed();
    const digest = buildDigest(await getStats(db, 7, NOW), await previousWeekTotals(db, NOW), NOW);
    expect(digest.subject).toBe("Portfolio weekly: 3 views, 2 visits (↑ 100% vs last week)");
    expect(digest.text).toContain("Resume downloads: 1");
    expect(digest.text).toContain("Viewed the Recruiter Dossier: 1 of 2 visits");
    expect(digest.text).toContain("LinkedIn: 1");
    expect(digest.html).toContain("https://ashishk9670.github.io/portfolio/insights/");
  });

  it("escapes visitor-controlled values in the HTML email", async () => {
    const db = await seed();
    const { html } = buildDigest(await getStats(db, 7, NOW), await previousWeekTotals(db, NOW), NOW);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(escapeHtml(`"a" & 'b'`)).toBe("&quot;a&quot; &amp; &#39;b&#39;");
  });

  it("sends through Resend to the notification address", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendWeeklyDigest({ ANALYTICS: await seed(), RESEND_API_KEY: "re_test" }, NOW);
    expect(result).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe("ashish.lumia9670@gmail.com");
    expect(body.subject).toMatch(/^Portfolio weekly:/);
  });
});
