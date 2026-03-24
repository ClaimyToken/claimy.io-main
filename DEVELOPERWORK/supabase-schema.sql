-- =============================================================================
-- Claimy — Supabase schema (Phantom registration + custodial deposit + nonces)
-- Run in: Dashboard → SQL → New query → Run
-- =============================================================================

-- OPTIONAL: destructive reset (dev only — uncomment intentionally)
-- drop table if exists public.claimy_withdraw_nonces cascade;
-- drop table if exists public.claimy_registration_nonces cascade;
-- drop table if exists public.claimy_users cascade;

create extension if not exists "pgcrypto";

create table if not exists public.claimy_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  wallet_address text not null unique,
  created_at timestamptz not null default now(),
  deposit_wallet_public_key text,
  deposit_wallet_private_key_encrypted text
);

create table if not exists public.claimy_registration_nonces (
  wallet_address text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, nonce)
);

create table if not exists public.claimy_withdraw_nonces (
  wallet_address text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, nonce)
);

alter table public.claimy_users enable row level security;
alter table public.claimy_registration_nonces enable row level security;
alter table public.claimy_withdraw_nonces enable row level security;

create unique index if not exists claimy_users_deposit_wallet_public_key_key
  on public.claimy_users (deposit_wallet_public_key)
  where deposit_wallet_public_key is not null;

-- -----------------------------------------------------------------------------
-- If claimy_users already existed without custodial columns:
-- -----------------------------------------------------------------------------
alter table public.claimy_users
  add column if not exists deposit_wallet_public_key text;

alter table public.claimy_users
  add column if not exists deposit_wallet_private_key_encrypted text;

create unique index if not exists claimy_users_deposit_wallet_public_key_key
  on public.claimy_users (deposit_wallet_public_key)
  where deposit_wallet_public_key is not null;

-- -----------------------------------------------------------------------------
-- Dev only — wipe all Claimy registration data (SQL Editor)
-- -----------------------------------------------------------------------------
-- delete from public.claimy_registration_nonces;
-- delete from public.claimy_withdraw_nonces;
-- delete from public.claimy_users;

-- Username must be lowercase (app sends lowercase).

-- -----------------------------------------------------------------------------
-- Playable credits (DB ledger) — additive migration for existing projects:
--   DEVELOPERWORK/migrations/claimy_playable_credits.sql
-- Doc: DEVELOPERWORK/PLAYABLE_CREDITS.md
-- -----------------------------------------------------------------------------
