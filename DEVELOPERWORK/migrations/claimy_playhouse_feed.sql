-- Flowerpoker rows for The Playhouse (Edge + service role).
--
-- p_wallet null/empty: all players, settled hands only (public feed).
-- p_wallet set: that wallet only, settled + in_progress (so unfinished games appear under "My bets").

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
  v_wallet text := nullif(trim(coalesce(p_wallet, '')), '');
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
    and (
      (
        v_wallet is null
        and coalesce(g.metadata->>'status', '') = 'settled'
      )
      or (
        v_wallet is not null
        and u.wallet_address = v_wallet
        and coalesce(g.metadata->>'status', '') in ('settled', 'in_progress')
      )
    );

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'gameKey', x.game_key,
          'sessionStatus', x.session_status,
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
        order by x.sort_at desc
      )
      from (
        select
          g.id,
          g.game_key,
          coalesce(g.metadata->>'status', '') as session_status,
          case
            when coalesce(g.metadata->>'status', '') = 'settled'
            then coalesce((g.metadata->>'settledAt')::timestamptz, g.created_at)
            else null
          end as settled_at,
          (nullif(trim(g.metadata->>'stakeAmount'), ''))::numeric as stake_amount,
          case
            when coalesce(g.metadata->>'status', '') = 'settled'
            then (nullif(trim(g.metadata->>'payoutAmount'), ''))::numeric
            else null
          end as payout_amount,
          case
            when coalesce(g.metadata->>'status', '') = 'settled'
            then g.metadata->>'winner'
            else null
          end as winner,
          case
            when coalesce(g.metadata->>'status', '') = 'settled'
            then g.metadata->>'playerHand'
            else null
          end as player_hand,
          case
            when coalesce(g.metadata->>'status', '') = 'settled'
            then g.metadata->>'houseHand'
            else null
          end as house_hand,
          u.username,
          u.wallet_address,
          case
            when coalesce(g.metadata->>'status', '') = 'settled'
            then g.metadata->'fairSnapshot'
            else null
          end as fair_snapshot,
          case
            when coalesce(g.metadata->>'status', '') = 'settled'
            then g.metadata->'finalRound'
            else null
          end as final_round,
          coalesce((g.metadata->>'settledAt')::timestamptz, g.created_at) as sort_at
        from claimy_game_sessions g
        inner join claimy_users u on u.id = g.user_id
        where g.game_key = 'flowerpoker'
          and (
            (
              v_wallet is null
              and coalesce(g.metadata->>'status', '') = 'settled'
            )
            or (
              v_wallet is not null
              and u.wallet_address = v_wallet
              and coalesce(g.metadata->>'status', '') in ('settled', 'in_progress')
            )
          )
        order by sort_at desc
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
  'Playhouse Flowerpoker: all settled when no wallet; wallet filter adds in_progress for that user.';

grant execute on function public.playhouse_list_settled_bets(text, int, int) to service_role;
