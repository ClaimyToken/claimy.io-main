# Claimy — developer handoff

This folder is the **single place** for whoever finishes backend, on-chain, and Supabase setup. The Angular app in this repo already calls the Edge Functions and the vault withdraw flow; **your job** is to deploy/configure everything below in order.

**Canonical long-form docs in this folder:** `SUPABASE_SETUP.md`, `CLAIMY_VAULT.md`. This README **summarizes** and adds **copy-paste SQL**; Edge Function **Deno source** for registration/login is only in `SUPABASE_SETUP.md` (except `withdraw-spl`, which lives in `../supabase/functions/withdraw-spl/index.ts`).

---

## What you are shipping

| Layer | What it does |
|--------|----------------|
| **Postgres (Supabase)** | `claimy_users` (Phantom + custodial deposit keypair ciphertext), nonce tables for register + withdraw replay protection. |
| **5 Edge Functions** | Username check, Phantom register (creates deposit wallet), wallet login, linked-wallet verify, signed withdraw → SPL transfer (**simple vault**) or **PDA** `withdraw_to_user`. |
| **Anchor program** `programs/claimy-vault` | Optional: PDA vault ATA; `initialize`; `withdraw_to_user` (relayer-signed). |
| **Angular** | Uses `ConfigService` / `.env` sync for RPC + mint; wallet modal calls Edge endpoints via `ClaimyEdgeService`. |

---

## Files in this folder

| File | Use |
|------|-----|
| **README.md** (this file) | Order of operations & checklist. |
| **SUPABASE_SETUP.md** | Full Edge Function source (paste into Supabase) + deep SQL notes. |
| **CLAIMY_VAULT.md** | Architecture: credits, custodial deposits, PDA vault, withdraw flow. |
| **supabase-schema.sql** | Run in Supabase SQL editor (fresh or additive migrations). |
| **supabase-verify.sql** | Read-only checks after deploy (users + withdraw nonces). |
| **EDGE_FUNCTIONS.md** | All function slugs, secrets, JWT, code locations. |
| **ONCHAIN_VAULT.md** | Anchor build/deploy, `initialize`, relayer, PDAs, funding vault. |
| **SIMPLE_VAULT_WITHDRAW.md** | Hot-wallet “vault” + Edge secret; no Anchor required for withdrawals. |
| **TESTING_DEPOSITS.md** | How to verify SPL deposits / Claimy Credits (Phantom + CLI). |
| **PLAYABLE_CREDITS.md** | DB ledger + `claimy-credits` Edge (playable balance, deposits, games). |
| **migrations/claimy_playable_credits.sql** | Run in Supabase to add tables + RPCs. |
| **migrations/claimy_playhouse_player_ranking_stats.sql** | RPC `playhouse_player_ranking_stats` — aggregates for Ranking progress (used by `playhouse-feed` action `player_ranking_stats`). Apply after `claimy_playhouse_feed.sql`. |
| **migrations/claimy_playhouse_include_blackjack.sql** | Extends Playhouse feed + ranking aggregates to include Blackjack sessions alongside Flowerpoker. |
| **FRONTEND_AND_ENV.md** | `env.template`, production env, what the SPA exposes. |

---

## Phase 1 — Database (Supabase SQL)

1. Open **Supabase Dashboard → SQL → New query**.
2. Paste and run **`supabase-schema.sql`** from this folder (review optional `DROP` / `DELETE` blocks before running in production).
3. Confirm tables exist: `claimy_users`, `claimy_registration_nonces`, `claimy_withdraw_nonces`.
4. Optionally run **`supabase-verify.sql`** to sanity-check columns and sample rows.

---

## Phase 2 — Edge Function secrets

In **Project Settings → Edge Functions → Secrets**, set every variable listed in **`EDGE_FUNCTIONS.md`**.

Minimum for a working stack:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `DEPOSIT_WALLET_ENCRYPTION_KEY` (64 hex chars) — registration only
- `CLAIMY_SPL_MINT` — must match app + on-chain mint
- For withdraw path: `SOLANA_RPC_URL`, `CLAIMY_VAULT_PROGRAM_ID`, `CLAIMY_RELAYER_PRIVATE_KEY`
- Optional: `CLAIMY_SPL_DECIMALS`, `CLAIMY_SPL_MINT` already enforced in withdraw

---

## Phase 3 — Deploy Edge Functions (core slugs)

For each function: **create slug exactly as named**, **JWT verification OFF**, paste Deno code.

| Slug | Source of Deno code |
|------|----------------------|
| `check-username` | **`SUPABASE_SETUP.md`** §3 (this folder) |
| `register-phantom` | **`SUPABASE_SETUP.md`** §4 |
| `wallet-login` | **`SUPABASE_SETUP.md`** §5 |
| `account-linked-wallet` | **`SUPABASE_SETUP.md`** §6 |
| `withdraw-spl` | **`../supabase/functions/withdraw-spl/index.ts`** (entire file) |

Do not rename slugs; the Angular app and `ClaimyEdgeService` expect these paths under `{supabaseUrl}/functions/v1/...`.
CI/deploy job names may differ, but the deployed function slug must still be exact.

### Playhouse / games slugs used by current frontend

In addition to the table above, current game pages also call:

- `flowerpoker-game`
- `blackjack-game`
- `claimy-credits`
- `claimy-referrals`
- `claimy-profile`
- `playhouse-feed` (**public feed**; `verify_jwt = false` in `supabase/config.toml`)
- `admin-sweep-wallets` (admin-only sweep panel in Account Settings; also `verify_jwt = false` with internal wallet whitelist check)

Admin sweep requires extra Edge secrets:

- `CLAIMY_ADMIN_WALLETS` (comma-separated Phantom wallets allowed to run sweeps)
- `CLAIMY_SWEEP_DESTINATION_WALLET` (optional default destination for collected tokens)
- `CLAIMY_SWEEP_FEE_PAYER_PRIVATE_KEY` (required for execute mode; pays tx fees)
- `DEPOSIT_WALLET_ENCRYPTION_KEY` (already used by registration; reused for decrypting custodial wallets during sweep)

Admin sweep behavior notes:

- Destination precedence is: request `destinationWallet` override -> `CLAIMY_SWEEP_DESTINATION_WALLET` -> caller admin wallet.
- `CLAIMY_SWEEP_FEE_PAYER_PRIVATE_KEY` wallet must be funded with SOL for tx fees.
- `summary_only` performs scan/ranking only (no transfers, no run logs); `dry_run` logs selection without transfers; `execute` transfers + logs.
- Sweep now updates `claimy_users.deposit_chain_balance_snapshot` after successful transfer so future `sync_from_chain` credit reconciliation stays correct.

If browser Network shows `OPTIONS /functions/v1/playhouse-feed` as `404`, the function is missing on that project.
Deploy with the exact slug:

`supabase functions deploy playhouse-feed --project-ref <your_ref>`

### Windows note (PowerShell script policy)

If PowerShell blocks `npm.ps1` / `npx.ps1`, use one of:

- `npm.cmd` / `npx.cmd`
- Command Prompt (`cmd`)
- or set execution policy for current user (`RemoteSigned`), then reopen terminal.

---

## Phase 4 — On-chain program (Anchor)

Follow **`ONCHAIN_VAULT.md`**:

1. Install Rust + Solana CLI + Anchor (Linux/macOS or **WSL2** on Windows; native Windows for Solana/Anchor is often painful).
2. `anchor keys sync` → `anchor build` → deploy to **devnet** or **mainnet-beta** to match your mint and RPC.
3. Call **`initialize(relayer)`** once per mint (relayer pubkey = public key of the pair whose **secret** is `CLAIMY_RELAYER_PRIVATE_KEY`).
4. Fund **vault ATA** with protocol liquidity (e.g. 15% supply). Derive addresses: from repo root `npm run vault:pdas -- <PROGRAM_ID> <MINT>`.
5. Fund **relayer** with SOL on the same cluster for tx fees.

Program source: **`../programs/claimy-vault/`**, **`../Anchor.toml`**.

---

## Phase 5 — Frontend / operators

Read **`FRONTEND_AND_ENV.md`**. Operators copy **`../env.template`** → **`.env`**, run **`npm run env:sync`**, then **`ng serve`** / production build with **`environment.prod.ts`** for public deploys (no `.env` on CI unless you wire it).

Ensure **`ConfigService.supabaseUrl`** matches the Supabase project (or `CLAIMY_SUPABASE_URL` in `.env` for local dev).

---

## Phase 6 — End-to-end test (suggested)

1. Register a new user (Phantom) → row in `claimy_users` with `deposit_wallet_public_key` set.
2. Login → wallet modal shows deposit address; **Verify** linked wallet succeeds (`account-linked-wallet`).
3. User has an **ATA** for Claimy mint (receive token once in wallet).
4. Vault ATA holds enough SPL; relayer has SOL.
5. **Withdraw** in UI → `withdraw-spl` returns `{ ok: true, signature }` or a clear `error` with `signatureValid: true`.

---

## Product gaps (optional next tickets)

- **Credits ledger**: enforce max withdraw vs DB/app balance before sending vault tx (not enforced on-chain today).
- **Sweep** custodial deposit wallets → vault ATA (job or new instruction).
- **Production RPC** + key hygiene (relayer key rotation, rate limits).

---

## Quick repo map

```
DEVELOPERWORK/SUPABASE_SETUP.md   Full Deno for functions 1–4, 6 + deep SQL notes
DEVELOPERWORK/CLAIMY_VAULT.md     Vault architecture narrative
DEVELOPERWORK/supabase-verify.sql Read-only SQL checks (users + withdraw nonces)
supabase/functions/               withdraw-spl implementation
programs/claimy-vault/            Anchor Rust program
scripts/derive-claimy-vault-pdas.cjs
scripts/sync-env.cjs
scripts/sync-env.cmd              Windows: sync env (or use npm run env:sync from repo root)
scripts/start-dev.cmd             Windows: sync + ng serve
env.template                      Repo root — copy → .env
src/environments/
src/app/services/config.service.ts
src/app/services/claimy-edge.service.ts
```

If a short doc in this folder disagrees with **`SUPABASE_SETUP.md`** or **`CLAIMY_VAULT.md`**, **trust those two** and fix the summary in the same PR.
