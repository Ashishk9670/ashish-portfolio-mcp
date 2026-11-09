import { describe, it, expect, vi } from "vitest";
import { buildContext, handleAsk, parseAnswer, systemPrompt, SOURCES } from "./assistant";

const loaders = {
  profile: async () => ({ name: "Ashish Kumar", role: "SDET II", location: "Bangalore, India", tagline: "t", summary: "SDET with 5+ years.", email: "a@example.com", github: "https://github.com/x", linkedin: "https://linkedin.com/in/x", availableForOpportunities: true, siteUrl: "https://example.com" }),
  experience: async () => [{ company: "Triomics Healthcare", role: "SDET II", location: "Bangalore", start: "Jun 2026", end: "Present", bullets: ["Leads automation."], stats: [{ value: "<5%", label: "escaped defects" }], impact: "i", stack: ["Playwright"] }],
  hiring: async () => ({ experience: "5+ years", targetRoles: "Senior SDET and Lead SDET", location: "Bangalore, India", relocation: "Open to relocation", domains: "Healthcare", leadership: "Mentored interns", coreStrengths: ["Strategy"], coreStack: ["Playwright"], highlights: ["h"], globalTeams: [{ company: "LiveSwitch", locations: ["Canada"] }], faq: [{ question: "Notice period", answer: "30 days.", meta: "m" }] }),
  quality: async () => ({ statement: { heading: "h", body: [], pillars: [] }, metrics: [{ name: "Flaky-test rate", value: "2–3%", context: "Triomics · LiveSwitch", shows: "s", evidence: "Measured at work.", source: "Measured at work" }], caseStudies: [{ slug: "s", eyebrow: "e", title: "Risk-tiered CI", summary: "Summary.", url: "u", sections: [] }] }),
  projects: async () => [{ slug: "p", title: "MCP Server", tagline: "Tagline.", stack: ["TypeScript"], featured: true, problem: "p", approach: [], results: [{ value: "10", label: "tools" }], outcome: "o", businessImpact: "b" }],
  skills: async () => ({ skills: [{ category: "Test Automation", items: ["Playwright"] }], usesStack: [] }),
  about: async () => ({ milestones: [], philosophy: [{ title: "Test where the risk is", description: "d", practice: "p" }], leadership: [{ title: "Mentoring", description: "d" }], education: { school: "NIT Warangal", degree: "B.Tech", gpa: "8.69 CGPA", start: "2017", end: "2021" }, certifications: ["Cypress"], achievements: ["CodeChef 4-star"] }),
  mentoring: async () => ({ url: "https://topmate.io/x", pageUrl: "p", audiences: [], topics: ["Interview prep"], sessions: [{ name: "Discovery call", format: "1:1 video call", length: "15 min", free: true }] }),
  posts: async () => [{ slug: "b", title: "Risk-Tiered CI", description: "d", date: "2026-11-05", readTimeMinutes: 3 }],
};

const ask = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://worker.test/ask", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ashishk9670.github.io", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("assistant context and prompt", () => {
  it("tags every fact with a citable source", async () => {
    const context = await buildContext(loaders as never);
    expect(context).toContain("[experience] SDET II at Triomics Healthcare");
    expect(context).toContain("[hiring] Notice period: 30 days.");
    expect(context).toContain("[quality] Flaky-test rate: 2–3% (Triomics · LiveSwitch)");
    expect(context).toContain("[mentoring] Offers career guidance");
    for (const line of context.split("\n")) expect(line).toMatch(/^\[(\w+)\] /);
    for (const tag of context.match(/^\[(\w+)\]/gm)!) expect(SOURCES).toHaveProperty(tag.slice(1, -1));
  });

  it("instructs the model to stay grounded and cite sources", () => {
    const prompt = systemPrompt("[hiring] Notice period: 30 days.");
    expect(prompt).toMatch(/ONLY the facts in the CONTEXT/);
    expect(prompt).toMatch(/Do not guess/);
    expect(prompt).toMatch(/SOURCES: tag1, tag2/);
    expect(prompt).toContain("[hiring] Notice period: 30 days.");
  });
});

describe("parseAnswer", () => {
  it("splits the answer from its sources and maps tags to pages", () => {
    const { answer, sources } = parseAnswer("Ashish's notice period is 30 days.\nSOURCES: hiring, [experience], made-up");
    expect(answer).toBe("Ashish's notice period is 30 days.");
    expect(sources.map((s) => s.label)).toEqual(["Interview & logistics FAQ", "Recruiter Dossier"]);
  });

  it("handles answers without a sources line or with none", () => {
    expect(parseAnswer("I don't have that information.")).toEqual({ answer: "I don't have that information.", sources: [] });
    expect(parseAnswer("Not on the site.\nSOURCES: none").sources).toEqual([]);
  });
});

describe("handleAsk", () => {
  const context = async () => "[hiring] Notice period: 30 days.";

  it("answers with sources and CORS for the portfolio origin", async () => {
    const run = vi.fn(async () => ({ response: "Ashish's notice period is 30 days.\nSOURCES: hiring" }));
    const res = await handleAsk(ask({ question: "What's his notice period?" }), { AI: { run } }, 0, context);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://ashishk9670.github.io");
    expect(await res.json()).toEqual({
      answer: "Ashish's notice period is 30 days.",
      sources: [{ label: "Interview & logistics FAQ", url: "https://ashishk9670.github.io/portfolio/experience/#faq" }],
    });
    const [, input] = run.mock.calls[0] as unknown as [string, { messages: { role: string; content: string }[]; temperature: number }];
    expect(input.messages[1]).toEqual({ role: "user", content: "What's his notice period?" });
    expect(input.temperature).toBeLessThanOrEqual(0.3);
  });

  it("rejects empty, oversized, or malformed questions without calling the model", async () => {
    const run = vi.fn();
    for (const body of [{ question: "" }, { question: "x".repeat(401) }, "{nope"]) {
      expect((await handleAsk(ask(body), { AI: { run } }, 0, context)).status).toBe(400);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("rate limits per client", async () => {
    const run = vi.fn();
    const limiter = { limit: async () => ({ success: false }) };
    const res = await handleAsk(ask({ question: "Hello there" }, { "cf-connecting-ip": "203.0.113.9" }), { AI: { run }, ASK_LIMITER: limiter }, 0, context);
    expect(res.status).toBe(429);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns 503 when the model fails or returns nothing", async () => {
    const failing = { run: vi.fn(async () => { throw new Error("quota"); }) };
    expect((await handleAsk(ask({ question: "Hello there" }), { AI: failing }, 0, context)).status).toBe(503);
    const empty = { run: vi.fn(async () => ({})) };
    expect((await handleAsk(ask({ question: "Hello there" }), { AI: empty }, 0, context)).status).toBe(503);
  });

  it("does not grant CORS to other origins", async () => {
    const run = vi.fn(async () => ({ response: "Hi.\nSOURCES: none" }));
    const res = await handleAsk(ask({ question: "Hello there" }, { origin: "https://evil.example" }), { AI: { run } }, 0, context);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
