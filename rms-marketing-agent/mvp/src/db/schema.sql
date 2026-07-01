-- Mini-RMS data model (docs 04). The daily_calendar_snapshots table is the one thing you
-- MUST populate from day 1 — it is the pace-curve history you can't reconstruct later.

CREATE TABLE listings (
  id            TEXT PRIMARY KEY,
  cm_id         TEXT NOT NULL,           -- channel-manager listing id (Guesty)
  name          TEXT NOT NULL,
  market        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reservations (
  id            TEXT PRIMARY KEY,
  listing_id    TEXT NOT NULL REFERENCES listings(id),
  check_in      DATE NOT NULL,
  check_out     DATE NOT NULL,
  booked_at     TIMESTAMPTZ NOT NULL,    -- the "as-of" for pace / lead-time
  nights        INT NOT NULL,
  revenue       NUMERIC(10,2) NOT NULL,
  room_revenue  NUMERIC(10,2) NOT NULL,
  channel       TEXT NOT NULL,
  status        TEXT NOT NULL            -- 'confirmed' | 'canceled'
);
CREATE INDEX idx_res_lookup ON reservations (listing_id, check_in, check_out);

-- Daily on-the-books snapshot per future stay-date. Capture every night.
CREATE TABLE daily_calendar_snapshots (
  snapshot_date DATE NOT NULL,           -- the day the snapshot ran
  listing_id    TEXT NOT NULL REFERENCES listings(id),
  stay_date     DATE NOT NULL,           -- the future night being observed
  is_booked     BOOLEAN NOT NULL,
  is_blocked    BOOLEAN NOT NULL,        -- owner/maintenance block
  is_sold_out   BOOLEAN NOT NULL,        -- for later unconstrained-demand estimation
  price         NUMERIC(10,2) NOT NULL,
  min_stay      INT NOT NULL,
  PRIMARY KEY (snapshot_date, listing_id, stay_date)
);
CREATE INDEX idx_snap_lookup ON daily_calendar_snapshots (listing_id, stay_date, snapshot_date);

CREATE TABLE targets (
  listing_id      TEXT NOT NULL REFERENCES listings(id),
  month           DATE NOT NULL,
  occ_target      NUMERIC(4,3) NOT NULL, -- 0..1
  revenue_budget  NUMERIC(12,2),
  PRIMARY KEY (listing_id, month)
);

-- Public market data only (Wheelhouse/AirROI) — never pooled confidential competitor data.
CREATE TABLE market_comps (
  listing_id      TEXT NOT NULL REFERENCES listings(id),
  as_of           DATE NOT NULL,
  comp_median_rate NUMERIC(10,2) NOT NULL,
  source          TEXT NOT NULL,
  PRIMARY KEY (listing_id, as_of)
);

CREATE TABLE findings (
  id            TEXT PRIMARY KEY,
  listing_id    TEXT NOT NULL REFERENCES listings(id),
  window_start  DATE NOT NULL,
  window_end    DATE NOT NULL,
  signal        TEXT NOT NULL,
  metrics_json  JSONB NOT NULL,
  confidence    NUMERIC(4,3) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recommendations (
  id            TEXT PRIMARY KEY,
  finding_id    TEXT NOT NULL REFERENCES findings(id),
  move_type     TEXT NOT NULL,
  channel       TEXT NOT NULL,
  depth_pct     NUMERIC(4,3) NOT NULL,
  tier          TEXT NOT NULL,           -- api | guided | recommend
  params_json   JSONB NOT NULL,
  status        TEXT NOT NULL            -- proposed | approved | executed | rejected
);

-- Immutable audit trail (docs 08 guardrails): the schema IS the audit record.
CREATE TABLE actions (
  id                TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  adapter           TEXT NOT NULL,
  approval_token    TEXT,               -- who/when approved
  request_json      JSONB NOT NULL,
  result_json       JSONB,
  executed_at       TIMESTAMPTZ DEFAULT now()
);
