-- One-shot aggregates for Ranking progress (Flowerpoker, settled only).
-- Replaces client-side paging over playhouse_list_settled_bets for stats.

create or replace function public.playhouse_player_ranking_stats(p_wallet text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wallet text := nullif(trim(coalesce(p_wallet, '')), '');
begin
  if v_wallet is null then
    return jsonb_build_object(
      'betsSettled', 0,
      'lifetimeWagered', 0,
      'pnl', 0,
      'wins', 0,
      'losses', 0,
      'ties', 0
    );
  end if;

  return (
    select jsonb_build_object(
      'betsSettled', count(*)::bigint,
      'lifetimeWagered', coalesce(
        sum((nullif(trim(g.metadata->>'stakeAmount'), ''))::numeric),
        0
      ),
      'pnl', coalesce(
        sum(
          coalesce((nullif(trim(g.metadata->>'payoutAmount'), ''))::numeric, 0)
          - coalesce((nullif(trim(g.metadata->>'stakeAmount'), ''))::numeric, 0)
        ),
        0
      ),
      'wins', count(*) filter (
        where trim(coalesce(g.metadata->>'winner', '')) = 'Player'
      )::bigint,
      'losses', count(*) filter (
        where trim(coalesce(g.metadata->>'winner', '')) = 'House'
      )::bigint,
      'ties', count(*) filter (
        where lower(trim(coalesce(g.metadata->>'winner', ''))) = 'tie'
      )::bigint
    )
    from claimy_game_sessions g
    inner join claimy_users u on u.id = g.user_id
    where g.game_key = 'flowerpoker'
      and u.wallet_address = v_wallet
      and coalesce(g.metadata->>'status', '') = 'settled'
  );
end;
$$;

comment on function public.playhouse_player_ranking_stats(text) is
  'Flowerpoker settled-session aggregates for one wallet: stake volume, PnL, W/L/T counts.';

grant execute on function public.playhouse_player_ranking_stats(text) to service_role;
