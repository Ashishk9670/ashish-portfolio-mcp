-- Cookieless, aggregate-only analytics. No IP addresses, user agents, or
-- persistent identifiers are stored: `session` is a random per-tab id that
-- the browser discards when the tab closes.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pageview', 'click', 'engagement')),
  path TEXT NOT NULL,
  session TEXT NOT NULL,
  label TEXT,
  target TEXT,
  action TEXT,
  source TEXT,
  country TEXT,
  device TEXT,
  seconds INTEGER,
  scroll INTEGER
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events (type, ts);
CREATE INDEX IF NOT EXISTS idx_events_session ON events (session);
