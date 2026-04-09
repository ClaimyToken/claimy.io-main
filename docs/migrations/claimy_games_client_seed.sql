-- Optional user-provided salt for provably fair games (Flowerpoker and future games).
-- When set, start_bet uses it if the request does not send clientSeed; otherwise random.

alter table public.claimy_users
  add column if not exists games_client_seed text;

comment on column public.claimy_users.games_client_seed is
  'Optional provably-fair client seed (max 128 chars in app). Null = use random per bet when not sent.';
