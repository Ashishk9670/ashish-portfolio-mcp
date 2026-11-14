import { getStats, type Stats } from "./analytics";
import { NOTIFY_EMAIL } from "./messages";

export const WEEKLY_DIGEST_CRON = "30 3 * * 1";
const DAY_MS = 86_400_000;
const DASHBOARD_URL = "https://ashishk9670.github.io/portfolio/insights/";

const ACTION_LABELS: Record<string, string> = {
  resume: "Resume downloads",
  contact: "Get in touch clicks",
  email: "Email clicks",
  message: "Messages sent",
  linkedin: "LinkedIn clicks",
  topmate: "Topmate (mentoring) clicks",
  repo: "Repository clicks",
  github: "GitHub profile clicks",
  ask: "Questions asked to the assistant",
};

export type PreviousTotals = { pageviews: number; sessions: number };

export async function previousWeekTotals(db: D1Database, now: number): Promise<PreviousTotals> {
  const row = await db
    .prepare(
      `SELECT SUM(type = 'pageview') AS pageviews,
              COUNT(DISTINCT CASE WHEN type = 'pageview' THEN session END) AS sessions
         FROM events WHERE ts >= ? AND ts < ?`
    )
    .bind(now - 14 * DAY_MS, now - 7 * DAY_MS)
    .first<{ pageviews: number | null; sessions: number | null }>();
  return { pageviews: Number(row?.pageviews ?? 0), sessions: Number(row?.sessions ?? 0) };
}

export function change(current: number, previous: number): string {
  if (!previous) return current ? "new this week" : "no change";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "no change";
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs last week`;
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Row = { label: string; value: string };

function section(title: string, rows: Row[], empty: string) {
  const text = [`${title}`, ...(rows.length ? rows.map((r) => `  - ${r.label}: ${r.value}`) : [`  ${empty}`])].join("\n");
  const html = `
    <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#0f766e">${escapeHtml(title)}</h3>
    ${
      rows.length
        ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
            .map(
              (r) =>
                `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;color:#111827">${escapeHtml(r.label)}</td><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#4b5563;font-family:monospace">${escapeHtml(r.value)}</td></tr>`
            )
            .join("")}</table>`
        : `<p style="margin:0;color:#4b5563;font-size:14px">${escapeHtml(empty)}</p>`
    }`;
  return { text, html };
}

export function buildDigest(stats: Stats, previous: PreviousTotals, now: number) {
  const { totals, funnel } = stats;
  const weekEnding = new Date(now).toISOString().slice(0, 10);
  const subject = `Portfolio weekly: ${totals.pageviews} views, ${totals.sessions} visits (${change(totals.sessions, previous.sessions)})`;

  const parts = [
    section(
      "This week",
      [
        { label: "Page views", value: `${totals.pageviews} (${change(totals.pageviews, previous.pageviews)})` },
        { label: "Visits", value: `${totals.sessions} (${change(totals.sessions, previous.sessions)})` },
        { label: "Tracked clicks", value: String(totals.clicks) },
      ],
      ""
    ),
    section(
      "Key actions",
      stats.keyActions.map((a) => ({ label: ACTION_LABELS[a.action] ?? a.action, value: String(a.clicks) })),
      "No key actions this week."
    ),
    section(
      "Recruiter funnel",
      totals.sessions
        ? [
            { label: "Viewed the Recruiter Dossier", value: `${funnel.viewedDossier} of ${funnel.sessions} visits` },
            { label: "…then reached out", value: String(funnel.dossierThenReachedOut) },
            { label: "Reached out from any page", value: String(funnel.reachedOut) },
          ]
        : [],
      "No visits this week."
    ),
    section(
      "Biodata (private)",
      stats.biodata.views
        ? [
            { label: "Views", value: `${stats.biodata.views} (${stats.biodata.visits} visits)` },
            ...stats.biodata.sources.slice(0, 3).map((r) => ({ label: `From ${r.source}`, value: String(r.visits) })),
          ]
        : [],
      "No biodata views this week."
    ),
    section(
      "Where visits came from",
      stats.referrers.slice(0, 5).map((r) => ({ label: r.source, value: String(r.sessions) })),
      "No visits this week."
    ),
    section(
      "Top pages",
      stats.pages.slice(0, 5).map((p) => ({ label: p.path, value: `${p.views} views` })),
      "No page views this week."
    ),
  ];

  const text = [
    `Portfolio analytics for the 7 days ending ${weekEnding}`,
    "",
    ...parts.map((p) => p.text),
    "",
    `Full dashboard: ${DASHBOARD_URL}`,
  ].join("\n\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
    <p style="margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#0f766e">Portfolio weekly</p>
    <h2 style="margin:6px 0 0;font-size:20px;color:#111827">7 days ending ${escapeHtml(weekEnding)}</h2>
    ${parts.map((p) => p.html).join("")}
    <p style="margin:28px 0 0"><a href="${DASHBOARD_URL}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Open the full dashboard</a></p>
  </div></body></html>`;

  return { subject, text, html };
}

export async function sendWeeklyDigest(
  env: { ANALYTICS: D1Database; RESEND_API_KEY: string },
  now: number
): Promise<{ ok: boolean; status: number }> {
  const [stats, previous] = await Promise.all([getStats(env.ANALYTICS, 7, now), previousWeekTotals(env.ANALYTICS, now)]);
  const digest = buildDigest(stats, previous, now);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Portfolio Analytics <onboarding@resend.dev>",
      to: NOTIFY_EMAIL,
      subject: digest.subject,
      text: digest.text,
      html: digest.html,
    }),
  });
  return { ok: res.ok, status: res.status };
}
