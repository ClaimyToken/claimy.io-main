# Supabase Edge Functions (source in repo)

These folders mirror what you paste into **Supabase Dashboard → Edge Functions** or deploy via `supabase functions deploy <name>`.

| Folder | Slug | Notes |
|--------|------|--------|
| `withdraw-spl` | `withdraw-spl` | SPL withdraw: **simple** hot-wallet transfer or **PDA** `withdraw_to_user`. See `DEVELOPERWORK/SUPABASE_SETUP.md` §7 and `DEVELOPERWORK/SIMPLE_VAULT_WITHDRAW.md`. |
| `claimy-credits` | `claimy-credits` | Playable balance (`get`), `sync_from_chain`, `list_ledger` (wallet history), `apply_delta` / `record_deposit` (mutation secret). See `DEVELOPERWORK/PLAYABLE_CREDITS.md`. |
| `register-phantom` | `register-phantom` | Phantom registration + custodial deposit + unique `referral_code`; optional `referralCode` credits referrer. Run migration `DEVELOPERWORK/migrations/claimy_referrals.sql`. |
| `wallet-login` | `wallet-login` | Session lookup: returns `referralCode` + `referralCount`, username / deposit, optional `gamesClientSeed`. |
| `claimy-profile` | `claimy-profile` | `set_games_client_seed` — optional account-wide provably fair client seed (max 128 chars). Run migration `DEVELOPERWORK/migrations/claimy_games_client_seed.sql`. |
| `claimy-referrals` | `claimy-referrals` | `leaderboard_referrals` (top 15, `referral_count` ≥ 1), `mine` (code + count for a wallet). |
| `flowerpoker-game` | `flowerpoker-game` | Bet lifecycle for Flowerpoker: create DB game row, lock stake, settle payout and persist round metadata. |
| `playhouse-feed` | `playhouse-feed` | Public paginated feed of settled Flowerpoker bets (`list_bets`). Run migration `DEVELOPERWORK/migrations/claimy_playhouse_feed.sql`. **`supabase/config.toml` sets `verify_jwt = false`** (public endpoint; server uses service role only). |

Other functions (`check-username`, etc.) remain documented in **`DEVELOPERWORK/SUPABASE_SETUP.md`** where not listed above.
