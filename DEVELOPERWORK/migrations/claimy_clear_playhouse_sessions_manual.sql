-- =============================================================================
-- MANUAL — run in Supabase SQL Editor when you want an empty Playhouse / recent bets feed.
-- Does NOT change playable_balance or claimy_credit_ledger (wallet history unchanged).
-- Backup first if unsure.
-- =============================================================================

delete from public.claimy_game_sessions;

-- Optional: reset player ranking stats are derived from this table; feed + stats will show zero bets.
