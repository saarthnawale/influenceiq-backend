-- ============================================================
-- InfluenceIQ Pro – Database Schema
-- Run this file once to set up all tables
-- Command: psql -U postgres -d influenceiq -f db/schema.sql
-- ============================================================

-- ─── BRANDS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,         -- bcrypt hashed
  plan        VARCHAR(20) DEFAULT 'free',    -- free | pro | enterprise
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── INFLUENCERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS influencers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID REFERENCES brands(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  handle          VARCHAR(100) NOT NULL,
  platform        VARCHAR(30) NOT NULL,   -- Instagram | TikTok | YouTube
  category        VARCHAR(50),
  tier            VARCHAR(20),            -- Mega | Macro | Mid | Nano
  followers       BIGINT DEFAULT 0,
  profile_url     TEXT,
  avatar_url      TEXT,
  -- Social API tokens (stored encrypted in production)
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMP,
  api_user_id     VARCHAR(100),           -- platform's internal user ID
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─── SOCIAL METRICS (synced from APIs) ───────────────────────
CREATE TABLE IF NOT EXISTS social_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   UUID REFERENCES influencers(id) ON DELETE CASCADE,
  synced_at       TIMESTAMP DEFAULT NOW(),
  platform        VARCHAR(30),
  followers       BIGINT,
  following       BIGINT,
  posts_count     INTEGER,
  -- Post-level metrics (averaged or summed over sync period)
  total_reach     BIGINT DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_likes     BIGINT DEFAULT 0,
  total_comments  BIGINT DEFAULT 0,
  total_shares    BIGINT DEFAULT 0,
  avg_engagement_rate DECIMAL(5,2),
  -- Computed
  period_start    DATE,
  period_end      DATE
);

-- ─── PROMO CODES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      UUID REFERENCES brands(id) ON DELETE CASCADE,
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  code          VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(10) NOT NULL,   -- percent | fixed
  discount_value DECIMAL(10,2) NOT NULL,
  max_uses      INTEGER,                -- NULL = unlimited
  uses          INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  expires_at    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── UTM LINKS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utm_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      UUID REFERENCES brands(id) ON DELETE CASCADE,
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  base_url      TEXT NOT NULL,
  utm_source    VARCHAR(100),
  utm_medium    VARCHAR(100),
  utm_campaign  VARCHAR(100),
  utm_content   VARCHAR(100),
  utm_term      VARCHAR(100),
  full_url      TEXT NOT NULL,          -- pre-built full URL
  clicks        INTEGER DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── CONVERSION EVENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversion_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID REFERENCES brands(id) ON DELETE CASCADE,
  influencer_id   UUID REFERENCES influencers(id) ON DELETE SET NULL,
  event_type      VARCHAR(30) NOT NULL,  -- purchase | signup | refund | view | add_to_cart
  amount          DECIMAL(10,2) DEFAULT 0,
  currency        VARCHAR(5) DEFAULT 'USD',
  -- Attribution
  attribution_source VARCHAR(30),        -- promo_code | utm_link | manual | api
  promo_code_id   UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  utm_link_id     UUID REFERENCES utm_links(id) ON DELETE SET NULL,
  promo_code_used VARCHAR(50),
  -- Customer info
  customer_id     VARCHAR(100),          -- your store's customer ID (optional)
  country         VARCHAR(5),
  device          VARCHAR(20),           -- mobile | desktop | tablet
  -- Meta
  event_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMP DEFAULT NOW(),
  raw_payload     JSONB                  -- store original webhook payload
);

-- ─── INDEXES (for fast queries) ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_influencer    ON conversion_events(influencer_id);
CREATE INDEX IF NOT EXISTS idx_events_date          ON conversion_events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_brand         ON conversion_events(brand_id);
CREATE INDEX IF NOT EXISTS idx_events_type          ON conversion_events(event_type);
CREATE INDEX IF NOT EXISTS idx_metrics_influencer   ON social_metrics(influencer_id);
CREATE INDEX IF NOT EXISTS idx_promo_code           ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_utm_influencer       ON utm_links(influencer_id);

-- ─── SAMPLE DATA (optional, for testing) ─────────────────────
-- Uncomment below to seed test data after setup

/*
INSERT INTO brands (name, email, password) VALUES
  ('Acme Brand', 'admin@acme.com', '$2a$10$examplehashedpassword');

INSERT INTO influencers (brand_id, name, handle, platform, followers, tier) VALUES
  ((SELECT id FROM brands LIMIT 1), 'Zara Voss',   '@zaravoss', 'Instagram', 2100000, 'Mega'),
  ((SELECT id FROM brands LIMIT 1), 'Leon Park',   '@leonpark',  'TikTok',   5400000, 'Mega'),
  ((SELECT id FROM brands LIMIT 1), 'Maya Rin',    '@mayarin',   'YouTube',   890000, 'Macro');
*/
