# Playable credits (database)

## What was added

| Piece | Purpose |
|--------|--------|
| **`claimy_users.playable_balance`** | Current app bankroll (numeric). |
| **`claimy_deposits`** | One row per credited on-chain deposit (`tx_signature` unique). |
| **`claimy_credit_ledger`** | Append-only log of every change (deposit, game, withdraw, etc.). |
| **`claimy_game_sessions`** | Optional table for per-round metadata (populate when you build games). |
| **RPCs** | `claimy_get_playable_balance`, `claimy_apply_credit_delta`, `claimy_record_deposit` — atomic updates. |
| **Edge `claimy-credits`** | HTTP API for `get` (public) and mutations (secret). |

## Deploy

1. Run **`DEVELOPERWORK/migrations/claimy_playable_credits.sql`** in Supabase SQL Editor.
2. Deploy Edge function **`claimy-credits`** from **`supabase/functions/claimy-credits/index.ts`** (same flow as `withdraw-spl`).
3. Set secret **`CLAIMY_CREDITS_MUTATION_SECRET`** (long random string) if you will call **`apply_delta`** or **`record_deposit`** from a backend/indexer.

## Edge API: `POST /functions/v1/claimy-credits`

### `sync_from_chain` (wallet **Refresh** cog)

Reconciles **`playable_balance`** in Postgres with the **on-chain SPL balance** of the user’s **custodial deposit address** (same RPC call as the old UI). Writes a **`chain_sync`** ledger row when they differ.

```json
{ "action": "sync_from_chain", "walletAddress": "<Phantom pubkey>" }
```

**Secrets** on the Edge runtime (same as `withdraw-spl`): **`SOLANA_RPC_URL`**, **`CLAIMY_SPL_MINT`**.

Response includes `synced: true` when a delta was applied, `synced: false` when already in sync.

### `get` balance (read-only)

```json
{ "action": "get", "walletAddress": "<Phantom pubkey>" }
```

Response: `{ "ok": true, "playableBalance": 123.45, "source": "database" }`

If the user is not registered: `{ "ok": false, "error": "Account not found." }`

### `apply_delta` (games / admin — requires secret)

Header: `Authorization: Bearer <CLAIMY_CREDITS_MUTATION_SECRET>`

```json
{
  "action": "apply_delta",
  "walletAddress": "<Phantom pubkey>",
  "delta": "-10.5",
  "entryType": "game_loss",
  "ref": "optional-correlation-id"
}
```

### `record_deposit` (indexer / worker — requires secret)

After you verify an on-chain transfer into the user’s deposit ATA:

```json
{
  "action": "record_deposit",
  "walletAddress": "<Phantom pubkey>",
  "txSignature": "<tx sig>",
  "mint": "<mint pubkey>",
  "amount": "500"
}
```

Same `tx_signature` twice returns **no double-credit** (idempotent).

## Angular behavior

`ClaimyCreditsService.refresh()` calls **`sync_from_chain`** first (so new deposits update the DB), then **`get`** if sync is unavailable, then **on-chain SPL** read as last resort.

## Next steps (not in this PR)

- **Seed** `playable_balance` for existing users (e.g. one-time backfill from chain or manual `record_deposit` per historical tx).
- **Withdraw `withdraw-spl`**: after a successful on-chain SPL send, call **`claimy_apply_credit_delta`** with negative `delta` equal to the amount withdrawn, or a dedicated `withdraw` entry type — so DB and vault stay aligned.
- **Indexer**: cron or webhook (Helius, etc.) to call **`record_deposit`** with verified txs.
