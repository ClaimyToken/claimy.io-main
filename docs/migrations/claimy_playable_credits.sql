-- =============================================================================
-- Playable credits (DB source of truth) + deposit log + ledger + optional game sessions
-- Run in Supabase SQL Editor after backup. Idempotent where possible.
-- =============================================================================

alter table public.claimy_users
  add column if not exists playable_balance numeric(38, 18) not null default 0;

comment on column public.claimy_users.playable_balance is
  'App bankroll for games / withdraw checks. Updated only via ledger RPCs or Edge (service role).';

-- -----------------------------------------------------------------------------
-- Confirmed on-chain deposits (idempotent by tx signature)
-- -----------------------------------------------------------------------------
create table if not exists public.claimy_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.claimy_users (id) on delete cascade,
  tx_signature text not null,
  mint text not null,
  amount numeric(38, 18) not null,
  created_at timestamptz not null default now(),
  unique (tx_signature)
);

create index if not exists claimy_deposits_user_id_created_at_idx
  on public.claimy_deposits (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Append-only ledger (every balance change)
-- -----------------------------------------------------------------------------
create table if not exists public.claimy_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.claimy_users (id) on delete cascade,
  entry_type text not null,
  amount_delta numeric(38, 18) not null,
  balance_after numeric(38, 18) not null,
  ref text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists claimy_credit_ledger_user_id_created_at_idx
  on public.claimy_credit_ledger (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Optional: one row per game round (populate when games call apply_delta with game ref)
-- -----------------------------------------------------------------------------
create table if not exists public.claimy_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.claimy_users (id) on delete cascade,
  game_key text not null,
  balance_before numeric(38, 18) not null,
  balance_after numeric(38, 18) not null,
  delta numeric(38, 18) not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists claimy_game_sessions_user_id_created_at_idx
  on public.claimy_game_sessions (user_id, created_at desc);

alter table public.claimy_deposits enable row level security;
alter table public.claimy_credit_ledger enable row level security;
alter table public.claimy_game_sessions enable row level security;

-- -----------------------------------------------------------------------------
-- RPC: read balance (PostgREST / Edge with service role)
-- -----------------------------------------------------------------------------
create or replace function public.claimy_get_playable_balance(p_wallet text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  select u.playable_balance into v
  from public.claimy_users u
  where u.wallet_address = p_wallet
  limit 1;
  if v is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: apply delta (games, adjustments). Fails if balance would go negative.
-- -----------------------------------------------------------------------------
create or replace function public.claimy_apply_credit_delta(
  p_wallet text,
  p_delta numeric,
  p_entry_type text,
  p_ref text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_new numeric;
begin
  if p_wallet is null or trim(p_wallet) = '' then
    raise exception 'WALLET_REQUIRED';
  end if;
  select id into v_uid from public.claimy_users where wallet_address = p_wallet for update;
  if v_uid is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.claimy_users
  set playable_balance = playable_balance + p_delta
  where id = v_uid
    and playable_balance + p_delta >= 0
  returning playable_balance into v_new;

  if v_new is null then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.claimy_credit_ledger (user_id, entry_type, amount_delta, balance_after, ref)
  values (v_uid, p_entry_type, p_delta, v_new, p_ref);

  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: record a deposit (same tx cannot credit twice)
-- -----------------------------------------------------------------------------
create or replace function public.claimy_record_deposit(
  p_wallet text,
  p_tx_sig text,
  p_mint text,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_new numeric;
  v_existing uuid;
begin
  if p_tx_sig is null or trim(p_tx_sig) = '' then
    raise exception 'TX_SIGNATURE_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select d.user_id into v_existing
  from public.claimy_deposits d
  where d.tx_signature = p_tx_sig
  limit 1;

  if v_existing is not null then
    select playable_balance into v_new from public.claimy_users where id = v_existing;
    return v_new;
  end if;

  select id into v_uid from public.claimy_users where wallet_address = p_wallet for update;
  if v_uid is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.claimy_deposits (user_id, tx_signature, mint, amount)
  values (v_uid, p_tx_sig, p_mint, p_amount);

  update public.claimy_users
  set playable_balance = playable_balance + p_amount
  where id = v_uid
  returning playable_balance into v_new;

  insert into public.claimy_credit_ledger (user_id, entry_type, amount_delta, balance_after, ref)
  values (v_uid, 'deposit', p_amount, v_new, p_tx_sig);

  return v_new;
end;
$$;

grant execute on function public.claimy_get_playable_balance(text) to service_role;
grant execute on function public.claimy_apply_credit_delta(text, numeric, text, text) to service_role;
grant execute on function public.claimy_record_deposit(text, text, text, numeric) to service_role;
