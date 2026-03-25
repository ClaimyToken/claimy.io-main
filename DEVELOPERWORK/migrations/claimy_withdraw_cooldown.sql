-- Per-wallet cooldown after a successful SPL withdraw (reduces fee-drain spam).
-- Edge function withdraw-spl reads/writes last_spl_withdraw_at.
-- Optional: set CLAIMY_WITHDRAW_COOLDOWN_SEC on the function (default 10; 0 = disable).

alter table public.claimy_users
  add column if not exists last_spl_withdraw_at timestamptz;

comment on column public.claimy_users.last_spl_withdraw_at is
  'Set when an on-chain withdraw confirms; used for minimum seconds between successful withdrawals.';
