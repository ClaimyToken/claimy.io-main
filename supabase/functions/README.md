<p align="center">
  <img src="https://i.imgur.com/K7VniKH.png" alt="Claimy" width="100%" />
</p>

# Supabase Edge Functions (source in repo)

These folders mirror what you paste into **Supabase Dashboard → Edge Functions** or deploy via `supabase functions deploy <name>`.

| Folder | Slug | Notes |
|--------|------|--------|
| `withdraw-spl` | `withdraw-spl` | SPL withdraw: **simple** hot-wallet transfer or **PDA** `withdraw_to_user`. See `docs/SUPABASE_SETUP.md` §7 and `docs/SIMPLE_VAULT_WITHDRAW.md`. |
| `claimy-credits` | `claimy-credits` | Playable balance (`get`), `sync_from_chain`, `list_ledger` (wallet history), `apply_delta` / `record_deposit` (mutation secret). See `docs/PLAYABLE_CREDITS.md`. |
| `register-phantom` | `register-phantom` | Phantom registration + custodial deposit + unique `referral_code`; optional `referralCode` credits referrer. Run migration `docs/migrations/claimy_referrals.sql`. |
| `wallet-login` | `wallet-login` | Session lookup: returns `referralCode` + `referralCount`, username / deposit, optional `gamesClientSeed`. |
| `claimy-profile` | `claimy-profile` | `set_games_client_seed` — optional account-wide provably fair client seed (max 128 chars). Run migration `docs/migrations/claimy_games_client_seed.sql`. |
| `claimy-referrals` | `claimy-referrals` | `leaderboard_referrals` (top 15, `referral_count` ≥ 1), `mine` (code + count for a wallet). |
| `flowerpoker-game` | `flowerpoker-game` | Bet lifecycle for Flowerpoker: create DB game row, lock stake, settle payout and persist round metadata. |
| `blackjack-game` | `blackjack-game` | Blackjack lifecycle: one fresh deck per hand, bet/hit/stand/double/insurance, resume, settlement, and fairness snapshot metadata in `claimy_game_sessions`. |
| `dice-game` | `dice-game` | One-shot Dice: roll under/over on `0…999` (1000 outcomes, HMAC `v2`), credit settle in `claimy_game_sessions` (`game_key` `dice`). Action: `roll`. |
| `admin-sweep-wallets` | `admin-sweep-wallets` | Admin-only custodial sweep tool (`admin_whoami`, `summary_only`, `dry_run`, `execute`) for consolidating CLAIMY SPL from deposit wallets. Supports top-holder limit, destination override, and optional debug trace output. Requires `CLAIMY_ADMIN_WALLETS`, `CLAIMY_SWEEP_DESTINATION_WALLET` (optional default), `CLAIMY_SWEEP_FEE_PAYER_PRIVATE_KEY` (execute), and `DEPOSIT_WALLET_ENCRYPTION_KEY`. |
| `playhouse-feed` | `playhouse-feed` | Actions: **`list_bets`** (paginated feed; public = settled only; wallet filter adds in-progress for “My bets”) and **`player_ranking_stats`** (single JSON of SUM/COUNT for settled sessions — Flowerpoker + Blackjack + Dice). Run `docs/migrations/claimy_playhouse_feed.sql`, **`claimy_playhouse_player_ranking_stats.sql`**, **`claimy_playhouse_include_blackjack.sql`**, and **`claimy_playhouse_include_dice.sql`**. **`supabase/config.toml` sets `verify_jwt = false`**. Redeploy after RPC or handler changes. If `OPTIONS` returns 404, the slug is not deployed on that project. |

Other functions (`check-username`, etc.) remain documented in **`docs/SUPABASE_SETUP.md`** where not listed above.
