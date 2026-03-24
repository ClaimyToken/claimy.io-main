-- Admin sweep logs for custodial deposit-wallet token consolidation.
-- Run in Supabase SQL editor.

create table if not exists public.claimy_admin_sweep_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by_wallet text not null,
  mode text not null check (mode in ('dry_run', 'execute')),
  destination_wallet text not null,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  wallets_scanned integer not null default 0,
  wallets_with_balance integer not null default 0,
  total_raw_amount numeric(78, 0) not null default 0,
  total_ui_amount numeric(38, 9) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_claimy_admin_sweep_runs_created_at
  on public.claimy_admin_sweep_runs (created_at desc);

create table if not exists public.claimy_admin_sweep_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.claimy_admin_sweep_runs(id) on delete cascade,
  user_id uuid references public.claimy_users(id) on delete set null,
  user_wallet_address text,
  deposit_wallet_address text not null,
  source_ata text not null,
  destination_ata text not null,
  raw_amount numeric(78, 0) not null default 0,
  ui_amount numeric(38, 9) not null default 0,
  tx_signature text,
  status text not null default 'pending' check (status in ('pending', 'swept', 'skipped', 'failed')),
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_claimy_admin_sweep_items_run
  on public.claimy_admin_sweep_items (run_id, created_at);

create index if not exists idx_claimy_admin_sweep_items_status
  on public.claimy_admin_sweep_items (status, created_at desc);
