import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isRateLimited, sendContactMessage } from "./messages";
import { createFakeKv } from "./testKv";

describe("isRateLimited", () => {
  it("allows the first 3 requests from an IP within the window", async () => {
    const kv = createFakeKv();
    expect(await isRateLimited(kv as never, "203.0.113.1")).toBe(false);
    expect(await isRateLimited(kv as never, "203.0.113.1")).toBe(false);
    expect(await isRateLimited(kv as never, "203.0.113.1")).toBe(false);
  });

  it("blocks the 4th request from the same IP within the window", async () => {
    const kv = createFakeKv();
    for (let i = 0; i < 3; i++) await isRateLimited(kv as never, "203.0.113.1");
    expect(await isRateLimited(kv as never, "203.0.113.1")).toBe(true);
  });

  it("tracks different IPs independently", async () => {
    const kv = createFakeKv();
    for (let i = 0; i < 3; i++) await isRateLimited(kv as never, "203.0.113.1");
    expect(await isRateLimited(kv as never, "203.0.113.1")).toBe(true);
    expect(await isRateLimited(kv as never, "203.0.113.2")).toBe(false);
  });

  it("sets an expiry on the counter rather than storing it forever", async () => {
    const kv = createFakeKv();
    await isRateLimited(kv as never, "203.0.113.1");
    expect(kv.put).toHaveBeenCalledWith(expect.any(String), "1", {
      expirationTtl: 60 * 60,
    });
  });

  it("never stores the raw IP as part of the KV key", async () => {
    const kv = createFakeKv();
    await isRateLimited(kv as never, "203.0.113.42");
    const [key] = kv.put.mock.calls[0];
    expect(key).not.toContain("203.0.113.42");
    expect(key).toMatch(/^msg-rate:[0-9a-f]{64}$/);
  });
});

describe("sendContactMessage", () => {
  const validPayload = {
    name: "A Visitor",
    email: "visitor@example.com",
    message: "Hello there.",
    website: "",
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a payload missing a required field without calling Resend", async () => {
    const result = await sendContactMessage("key", { email: "visitor@example.com" });
    expect(result).toEqual({ ok: false, status: 400, reason: "invalid payload" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid email without calling Resend", async () => {
    const result = await sendContactMessage("key", { ...validPayload, email: "not-an-email" });
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("silently accepts and drops a submission when the honeypot is filled", async () => {
    const result = await sendContactMessage("key", { ...validPayload, website: "I am a bot" });
    expect(result).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends via Resend with the visitor's address as reply-to on a valid submission", async () => {
    const result = await sendContactMessage("secret-key", validPayload);
    expect(result).toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret-key" }),
      })
    );
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.reply_to).toBe(validPayload.email);
    expect(body.text).toContain(validPayload.message);
  });

  it("returns a clean failure, not a throw, when Resend rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 }))
    );
    const result = await sendContactMessage("bad-key", validPayload);
    expect(result).toEqual({ ok: false, status: 502, reason: "Resend responded 401" });
  });
});
