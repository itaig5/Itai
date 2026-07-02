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

-- ===========================================================================
-- v2 additions (BUILD_PROMPT): visibility, cross-channel promotions, the
-- learning loop's outcome log + feature store, bandit state, settings, audit.
-- ===========================================================================

-- Raw multi-source visibility observations (doc 11: funnel data is mostly
-- operator-input; rank comes from the compliant PUBLIC-search proxy).
CREATE TABLE visibility_observations (
  id            BIGSERIAL PRIMARY KEY,
  listing_id    TEXT NOT NULL REFERENCES listings(id),
  platform      TEXT NOT NULL,           -- airbnb | booking | expedia | vrbo
  observed_at   DATE NOT NULL,
  source        TEXT NOT NULL,           -- market_insights | public_rank | operator_input | reviews
  rank          INT,
  impressions   INT,
  ctr           NUMERIC(6,4),
  conversion    NUMERIC(6,4),
  review_score  NUMERIC(4,2),
  programs_json JSONB
);
CREATE INDEX idx_vis_lookup ON visibility_observations (listing_id, platform, observed_at);

-- Cross-channel promotion state (the Promotion Radar). source distinguishes
-- RevPilot-managed promos from operator/OTA-created ones (the stacking hazard).
CREATE TABLE promotions (
  id                 TEXT PRIMARY KEY,
  listing_id         TEXT NOT NULL REFERENCES listings(id),
  channel            TEXT NOT NULL,
  type               TEXT NOT NULL,
  depth_pct          NUMERIC(4,3) NOT NULL,
  window_start       DATE NOT NULL,
  window_end         DATE NOT NULL,
  status             TEXT NOT NULL,      -- active | scheduled | ended | pending_sync
  source             TEXT NOT NULL,      -- revpilot | operator | ota
  recommendation_id  TEXT REFERENCES recommendations(id),
  created_at         TIMESTAMPTZ DEFAULT now(),
  ended_at           TIMESTAMPTZ,
  ended_reason       TEXT                -- pace_recovered | operator | expired | guardrail
);
CREATE INDEX idx_promo_active ON promotions (listing_id, channel, status);

-- The immutable outcome log — every action's measured result IS the training data
-- (doc 12 §3: the moat is proprietary outcome data). Append-only by policy.
CREATE TABLE outcomes (
  id                 TEXT PRIMARY KEY,
  recommendation_id  TEXT NOT NULL REFERENCES recommendations(id),
  listing_id         TEXT NOT NULL REFERENCES listings(id),
  channels           TEXT[] NOT NULL,
  action_type        TEXT NOT NULL,
  depth_pct          NUMERIC(4,3) NOT NULL,
  context_json       JSONB NOT NULL,     -- BanditContext at decision time (OWN data only)
  executed_at        DATE NOT NULL,
  measure_after_days INT NOT NULL,
  measured_at        DATE,
  baseline_json      JSONB NOT NULL,     -- OutcomeMetrics pre-period
  result_json        JSONB,              -- OutcomeMetrics post-period
  booking_lift       NUMERIC(8,3),
  revenue_lift       NUMERIC(10,2),
  visibility_change  INT,
  reward             NUMERIC(5,4),       -- normalized 0..1 for the bandit
  status             TEXT NOT NULL       -- pending | measured
);
CREATE INDEX idx_outcome_pending ON outcomes (status, executed_at);

-- Flat decision-time feature rows (the feature store): one row per recommendation.
CREATE TABLE feature_rows (
  recommendation_id  TEXT PRIMARY KEY REFERENCES recommendations(id),
  listing_id         TEXT NOT NULL,
  as_of              DATE NOT NULL,
  features_json      JSONB NOT NULL
);

-- Bandit posteriors (mirrors the ML service's registry; the TS fallback reads/writes this).
CREATE TABLE bandit_state (
  bucket   TEXT NOT NULL,               -- e.g. 'd1|v0|c1'
  arm_id   TEXT NOT NULL,               -- e.g. 'last_minute@0.15'
  alpha    NUMERIC(10,4) NOT NULL DEFAULT 1,
  beta     NUMERIC(10,4) NOT NULL DEFAULT 1,
  pulls    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, arm_id)
);

-- Model registry (champion/challenger + eval metrics incl. the confidently-wrong rate).
CREATE TABLE model_registry (
  id          BIGSERIAL PRIMARY KEY,
  task        TEXT NOT NULL,             -- promo_policy | forecast
  name        TEXT NOT NULL,
  version     TEXT NOT NULL,
  role        TEXT NOT NULL,             -- champion | challenger | retired
  params_json JSONB,
  metrics_json JSONB,                    -- {mape, bias, confidentlyWrong, ...}
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Operator settings: autonomy mode + operator-set auto-execution bounds (no hidden
-- auto-accept — RealPage/AB325), guardrail caps, channel connections.
CREATE TABLE operator_settings (
  id            INT PRIMARY KEY DEFAULT 1,
  settings_json JSONB NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Immutable audit trail v2 (extends actions): every event in the loop, append-only.
CREATE TABLE audit_events (
  id                TEXT PRIMARY KEY,
  ts                TIMESTAMPTZ NOT NULL,
  actor             TEXT NOT NULL,       -- system | operator | workflow
  kind              TEXT NOT NULL,
  listing_id        TEXT,
  recommendation_id TEXT,
  channel           TEXT,
  detail            TEXT NOT NULL,
  payload_json      JSONB
);
CREATE INDEX idx_audit_ts ON audit_events (ts DESC);
