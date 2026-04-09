-- Tracks last seen SPL balance on the custodial deposit ATA (same mint as app).
-- sync_from_chain only credits (deposit_increase) when on-chain deposit grows vs this snapshot,
-- not when playable_balance < on-chain (e.g. after withdraw — credits down, deposit unchanged).
-- Run once in Supabase SQL after backup.

alter table public.claimy_users
  add column if not exists deposit_chain_balance_snapshot numeric(38, 18);

comment on column public.claimy_users.deposit_chain_balance_snapshot is
  'Last SPL (human units) seen on custodial deposit ATA for CLAIMY_SPL_MINT; used by sync_from_chain only to detect new deposits.';
