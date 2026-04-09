# Claimy vault architecture (PDA + credits)

This document ties together the **Angular app**, **Supabase Edge Functions**, **per-user custodial deposit wallets**, and the **on-chain `claimy-vault` program** (PDA vault).

**Faster path without Anchor:** `withdraw-spl` also supports a **simple hot-wallet vault** (`CLAIMY_SIMPLE_VAULT_PRIVATE_KEY`) — standard SPL transfer from your funded wallet. See **`docs/SIMPLE_VAULT_WITHDRAW.md`**. The Anchor program and PDA code paths stay in the repo for when you switch.

## Roles

| Piece | Role |
|--------|------|
| **User Phantom wallet** | Registration identity; withdraw destination ATA owner. |
| **Per-user deposit keypair** | Generated at register; encrypted in DB. Users send Claimy SPL here; you credit **Claimy Credits** in app logic. |
| **Vault (PDA + vault ATA)** | Holds protocol liquidity (e.g. 15% of supply). No private key; program signs with [`invoke_signed`](https://solana.com/docs/core/pda). |
| **Relayer keypair** | Hot key stored as a **secret** (e.g. Edge Function). Only it may invoke `withdraw_to_user` on-chain. |
| **`withdraw-spl` (Edge)** | Verifies Phantom `signMessage`, DB user row, vault/user ATAs; reserves nonce; submits tx with **`withdraw_to_user`** (`supabase/functions/withdraw-spl/index.ts`). |

## Intended withdrawal flow

1. User requests withdraw **N** Claimy Credits (signed message, already stubbed in `withdraw-spl`).
2. Backend checks ledger: allowed amount, nonce, etc.
3. **Funding sources (product logic, not yet all on-chain):**
   - Prefer spending SPL already on the user’s **deposit wallet** (sweep or direct transfer).
   - Cover any shortfall from the **vault ATA** via `withdraw_to_user` (relayer-signed tx, PDA signs CPI).
4. Optionally **sweep** deposit-wallet SPL into the vault ATA on a schedule to consolidate liquidity.

The program shipped in `programs/claimy-vault` implements **only** step 3’s **vault → user ATA** leg. Sweeps and credits accounting stay in your backend until you add more instructions or jobs.

## On-chain program (`programs/claimy-vault`)

- **`initialize(relayer)`** — One-time per mint: creates config PDA, vault authority PDA, and **vault token account** (ATA owned by vault PDA). Fund this ATA with the 15% (or bridge mints into it).
- **`withdraw_to_user(amount)`** — Relayer signs; moves SPL from vault ATA to the user’s ATA for the same mint. `destination_owner` must be the owner of `user_token_account` (user’s Phantom pubkey).

PDAs use seeds documented in `programs/claimy-vault/README.md`.

## Secrets / config

| Name | Where |
|------|--------|
| `CLAIMY_RELAYER_PRIVATE_KEY` | Edge secret — base58 64-byte secret or `[uint8,...]` JSON; **never** in Angular. Must match `VaultState.relayer` from `initialize`. |
| `CLAIMY_VAULT_PROGRAM_ID` | Edge — deployed program id (sync with `declare_id!`). |
| `SOLANA_RPC_URL` | Edge — HTTPS JSON-RPC for `sendTransaction`. |
| `CLAIMY_SPL_MINT` | Edge — must match signed message + vault mint. |
| `CLAIMY_SPL_DECIMALS` | Edge optional — avoids extra `getMint` call. |

## Local / devnet checklist

1. Install Anchor + Solana CLI; `anchor build` in repo (see `programs/claimy-vault/README.md`).
2. `anchor keys list` / deploy program; `anchor keys sync`.
3. Call **`initialize`** once per mint (script or Anchor test) with your chosen relayer pubkey.
4. Send Claimy SPL to **vault ATA** (use `scripts/derive-claimy-vault-pdas.cjs` to print addresses).
5. Paste/deploy **`supabase/functions/withdraw-spl/index.ts`** and set Edge secrets (see `SUPABASE_SETUP.md` §7).
6. Ensure user has an **ATA** for Claimy mint (Phantom normally creates on first receive). If on-chain tx fails after a nonce was stored, the user must sign again with a **new nonce**.

## Repo layout

```
programs/claimy-vault/              Anchor program (Rust)
supabase/functions/withdraw-spl/   Edge Function (Deno) — vault withdraw tx
scripts/derive-claimy-vault-pdas.cjs PDA + vault ATA helper
Anchor.toml                         Workspace config (update program id after deploy)
```

## References

- [Program Derived Addresses (PDAs)](https://solana.com/docs/core/pda)
- [Anchor book](https://www.anchor-lang.com/docs)
