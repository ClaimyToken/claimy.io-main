-- Atomic chain sync: one transaction + row lock so concurrent sync_from_chain cannot double-credit.
-- Run in Supabase SQL Editor after claimy_playable_credits.sql + claimy_deposit_chain_snapshot.sql.

create or replace function public.claimy_sync_from_chain_apply(
  p_wallet text,
  p_onchain numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_snap numeric;
  v_playable numeric;
  v_snap_has boolean;
  v_snap0 numeric;
  v_delta numeric;
  v_new numeric;
  v_eps constant numeric := 0.00000001;
  v_ref text;
begin
  if p_wallet is null or trim(p_wallet) = '' then
    return jsonb_build_object('ok', false, 'error', 'WALLET_REQUIRED');
  end if;
  if p_onchain is null or p_onchain < 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ONCHAIN');
  end if;

  select u.id, u.deposit_chain_balance_snapshot, u.playable_balance
  into v_uid, v_snap, v_playable
  from public.claimy_users u
  where u.wallet_address = trim(p_wallet)
  for update;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'USER_NOT_FOUND');
  end if;

  v_snap_has := v_snap is not null;

  if not v_snap_has then
    if v_playable > v_eps then
      update public.claimy_users
      set deposit_chain_balance_snapshot = p_onchain
      where id = v_uid;
      return jsonb_build_object(
        'ok', true,
        'playableBalance', v_playable,
        'synced', false,
        'onchainBalance', p_onchain,
        'baselineSnapshot', true,
        'source', 'database'
      );
    end if;
    v_snap0 := 0;
  else
    v_snap0 := v_snap;
  end if;

  v_delta := p_onchain - v_snap0;

  if abs(v_delta) < v_eps then
    update public.claimy_users
    set deposit_chain_balance_snapshot = p_onchain
    where id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'playableBalance', v_playable,
      'synced', false,
      'onchainBalance', p_onchain,
      'source', 'database'
    );
  end if;

  if v_playable + v_delta < 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_BALANCE_RECONCILE',
      'onchainBalance', p_onchain,
      'playableBalanceBefore', v_playable,
      'snapshotBefore', v_snap0
    );
  end if;

  update public.claimy_users
  set
    playable_balance = playable_balance + v_delta,
    deposit_chain_balance_snapshot = p_onchain
  where id = v_uid
  returning playable_balance into v_new;

  v_ref := case when v_delta > 0 then 'deposit_increase' else 'deposit_decrease' end;

  insert into public.claimy_credit_ledger (user_id, entry_type, amount_delta, balance_after, ref)
  values (v_uid, 'chain_sync', v_delta, v_new, v_ref);

  return jsonb_build_object(
    'ok', true,
    'playableBalance', v_new,
    'synced', true,
    'deltaApplied', v_delta,
    'onchainBalance', p_onchain,
    'source', 'database'
  );
end;
$$;

grant execute on function public.claimy_sync_from_chain_apply(text, numeric) to service_role;
