import { ContactMessageSchema } from "./schemas";
import { getProfile } from "./data";

const RATE_LIMIT_PREFIX = "msg-rate:";
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

// The raw IP is only ever hashed, never stored — same "no IP persisted" rule
// the visitor beacon holds to. This key exists purely to rate-limit, not to
// identify anyone.
async function hashIp(ip: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isRateLimited(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = RATE_LIMIT_PREFIX + (await hashIp(ip));
  const count = parseInt((await kv.get(key)) ?? "0", 10);
  if (count >= RATE_LIMIT_MAX) return true;
  // expirationTtl means a stale counter needs no cleanup step of its own.
  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return false;
}

export type SendResult = { ok: true } | { ok: false; status: number; reason: string };

export async function sendContactMessage(
  resendApiKey: string,
  payload: unknown
): Promise<SendResult> {
  const parsed = ContactMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, status: 400, reason: "invalid payload" };
  }

  const { name, email, message, website } = parsed.data;

  // Silently accept-and-drop rather than a visible rejection, so a bot's
  // response never distinguishes "honeypot tripped" from "message sent" —
  // nothing in the response teaches it which field to leave alone next time.
  if (website) {
    return { ok: true };
  }

  const profile = await getProfile();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Portfolio Contact <onboarding@resend.dev>",
      to: profile.email,
      reply_to: email,
      subject: `Portfolio message from ${name || email}`,
      text: `${message}\n\n—\n${name ? `${name} · ` : ""}${email}`,
    }),
  });

  if (!res.ok) {
    return { ok: false, status: 502, reason: `Resend responded ${res.status}` };
  }

  return { ok: true };
}
