-- Public settled Flowerpoker sessions for The Playhouse feed (Edge + service role).

create or replace function public.playhouse_list_settled_bets(
  p_wallet text,
  p_limit int,
  p_offset int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_rows jsonb;
  v_lim int := coalesce(nullif(p_limit, 0), 15);
  v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_lim < 1 then
    v_lim := 15;
  end if;
  if v_lim > 50 then
    v_lim := 50;
  end if;

  select count(*)::bigint into v_total
  from claimy_game_sessions g
  inner join claimy_users u on u.id = g.user_id
  where g.game_key = 'flowerpoker'
    and coalesce(g.metadata->>'status', '') = 'settled'
    and (p_wallet is null or length(trim(p_wallet)) = 0 or u.wallet_address = trim(p_wallet));

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'gameKey', x.game_key,
          'settledAt', x.settled_at,
          'stakeAmount', x.stake_amount,
          'payoutAmount', x.payout_amount,
          'winner', x.winner,
          'playerHand', x.player_hand,
          'houseHand', x.house_hand,
          'username', x.username,
          'walletAddress', x.wallet_address,
          'fairSnapshot', x.fair_snapshot,
          'finalRound', x.final_round
        )
        order by x.settled_at desc
      )
      from (
        select
          g.id,
          g.game_key,
          coalesce((g.metadata->>'settledAt')::timestamptz, g.created_at) as settled_at,
          (nullif(trim(g.metadata->>'stakeAmount'), ''))::numeric as stake_amount,
          (nullif(trim(g.metadata->>'payoutAmount'), ''))::numeric as payout_amount,
          g.metadata->>'winner' as winner,
          g.metadata->>'playerHand' as player_hand,
          g.metadata->>'houseHand' as house_hand,
          u.username,
          u.wallet_address,
          g.metadata->'fairSnapshot' as fair_snapshot,
          g.metadata->'finalRound' as final_round
        from claimy_game_sessions g
        inner join claimy_users u on u.id = g.user_id
        where g.game_key = 'flowerpoker'
          and coalesce(g.metadata->>'status', '') = 'settled'
          and (p_wallet is null or length(trim(p_wallet)) = 0 or u.wallet_address = trim(p_wallet))
        order by coalesce((g.metadata->>'settledAt')::timestamptz, g.created_at) desc
        limit v_lim
        offset v_off
      ) x
    ),
    '[]'::jsonb
  ) into v_rows;

  return jsonb_build_object('total', v_total, 'rows', coalesce(v_rows, '[]'::jsonb));
end;
$$;

comment on function public.playhouse_list_settled_bets(text, int, int) is
  'Paginated settled Flowerpoker bets for Playhouse; p_wallet null or empty = all users.';

grant execute on function public.playhouse_list_settled_bets(text, int, int) to service_role;
