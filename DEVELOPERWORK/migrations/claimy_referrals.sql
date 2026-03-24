-- =============================================================================
-- Referrals: unique code per user, optional referred-by, referral_count
-- Run in Supabase SQL Editor after backup. Idempotent.
-- =============================================================================

alter table public.claimy_users
  add column if not exists referral_code text;

alter table public.claimy_users
  add column if not exists referral_count integer not null default 0;

alter table public.claimy_users
  add column if not exists referred_by_user_id uuid references public.claimy_users (id) on delete set null;

comment on column public.claimy_users.referral_code is
  'Unique invite code for this user (lowercase alphanumeric).';
comment on column public.claimy_users.referral_count is
  'How many accounts registered using this user''s referral_code.';
comment on column public.claimy_users.referred_by_user_id is
  'Optional FK to the referrer''s claimy_users row.';

create unique index if not exists claimy_users_referral_code_key
  on public.claimy_users (referral_code)
  where referral_code is not null;

-- Backfill: 12 hex chars from uuid (no dashes) — unique per row
update public.claimy_users u
set referral_code = lower(substring(replace(u.id::text, '-', '') from 1 for 12))
where u.referral_code is null;

alter table public.claimy_users
  alter column referral_code set not null;

-- -----------------------------------------------------------------------------
-- Service role: increment referrer count atomically (Edge register-phantom)
-- -----------------------------------------------------------------------------
create or replace function public.claimy_increment_referral_count(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;
  update public.claimy_users
  set referral_count = referral_count + 1
  where id = p_user_id;
end;
$$;

grant execute on function public.claimy_increment_referral_count(uuid) to service_role;
