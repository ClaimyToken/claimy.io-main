-- Bankroll-linked max stake: ratio stored in DB; snapshots for audit (optional).
-- Run in Supabase SQL editor after review.

CREATE TABLE IF NOT EXISTS claimy_bankroll_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_stake_bankroll_ratio numeric NOT NULL DEFAULT 0.005
    CHECK (max_stake_bankroll_ratio > 0 AND max_stake_bankroll_ratio <= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO claimy_bankroll_settings (id, max_stake_bankroll_ratio)
VALUES (1, 0.005)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE claimy_bankroll_settings IS
  'Single row: max stake = bankroll SPL balance × max_stake_bankroll_ratio (e.g. 0.005 = 0.5%).';

CREATE TABLE IF NOT EXISTS claimy_bankroll_snapshots (
  id bigserial PRIMARY KEY,
  balance_ui numeric NOT NULL,
  max_stake_ui numeric NOT NULL,
  ratio numeric NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claimy_bankroll_snapshots_observed_idx
  ON claimy_bankroll_snapshots (observed_at DESC);

COMMENT ON TABLE claimy_bankroll_snapshots IS
  'Written when a stake passes assertStakeWithinBankrollCap (Edge).';

ALTER TABLE claimy_bankroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE claimy_bankroll_snapshots ENABLE ROW LEVEL SECURITY;

-- No public access; service role bypasses RLS.
