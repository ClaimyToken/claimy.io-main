# Supabase Edge Functions — Claimy

All functions: **JWT verification OFF** (public Phantom flow; auth is signature + DB).

---

## Secrets matrix

| Secret | Used by | Notes |
|--------|---------|--------|
| `SUPABASE_URL` | All | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Service role — never expose to browser |
| `DEPOSIT_WALLET_ENCRYPTION_KEY` | `register-phantom` | Exactly **64 hex chars** (32 bytes), AES-GCM for custodial keypair |
| `CLAIMY_SPL_MINT` | `withdraw-spl` | Enforces mint in signed message; must match app |
| `SOLANA_RPC_URL` | `withdraw-spl` | HTTPS JSON-RPC (cluster must match mint + program deploy) |
| `CLAIMY_SIMPLE_VAULT_PRIVATE_KEY` | `withdraw-spl` | **Optional simple mode:** hot wallet (SPL + SOL); SPL transfer to user. If set, used **instead of** PDA vault. |
| `CLAIMY_VAULT_PROGRAM_ID` | `withdraw-spl` | PDA mode: deployed `claimy_vault` program id |
| `CLAIMY_RELAYER_PRIVATE_KEY` | `withdraw-spl` | PDA mode: Base58 or JSON; must match on-chain `VaultState.relayer` |
| `CLAIMY_SPL_DECIMALS` | `withdraw-spl` | Optional; skips `getMint` if set (e.g. `9`) |
| `CLAIMY_CREDITS_MUTATION_SECRET` | `claimy-credits` | Optional; **required** for `apply_delta` / `record_deposit` (`Authorization: Bearer …`). |

---

## Functions (exact slugs)

| # | Slug | HTTP | Purpose |
|---|------|------|---------|
| 1 | `check-username` | POST | Username availability (+ optional wallet for re-register) |
| 2 | `register-phantom` | POST | Ed25519 verify, nonce replay, create custodial deposit wallet, insert user |
| 3 | `wallet-login` | POST | Lookup by Phantom `wallet_address`, return username + deposit address |
| 4 | `account-linked-wallet` | POST | Returns `registrationWallet` from DB for modal Verify |
| 5 | `withdraw-spl` | POST | Ed25519 verify, nonce, SPL transfer (simple vault) or `withdraw_to_user` (PDA) |
| 6 | `claimy-credits` | POST | `get` playable balance; mutations with shared secret — see **`PLAYABLE_CREDITS.md`** |

---

## Where to paste code

| Slug | File / doc |
|------|------------|
| `check-username` | **`DEVELOPERWORK/SUPABASE_SETUP.md`** — section **§3** |
| `register-phantom` | **`DEVELOPERWORK/SUPABASE_SETUP.md`** — **§4** |
| `wallet-login` | **`DEVELOPERWORK/SUPABASE_SETUP.md`** — **§5** |
| `account-linked-wallet` | **`DEVELOPERWORK/SUPABASE_SETUP.md`** — **§6** |
| `withdraw-spl` | **`../supabase/functions/withdraw-spl/index.ts`** (copy entire file into Edge editor) |
| `claimy-credits` | **`../supabase/functions/claimy-credits/index.ts`** |

---

## `withdraw-spl` response shape

- Success: `{ "ok": true, "signature": "<tx_signature>" }`
- Valid signature but business/chain failure: `{ "ok": false, "signatureValid": true, "error": "..." }`
- Bad request / invalid signature: `ok: false`, may omit `signatureValid`

---

## Nonce behavior (`withdraw-spl`)

Nonce row is inserted **after** vault/user ATA checks and **immediately before** `sendTransaction`. If the transaction fails after insert, the user must **sign a new message** (new nonce) to retry.

---

## Deploy checklist

- [ ] All secrets set
- [ ] All five functions created with **exact** slugs
- [ ] JWT disabled on each
- [ ] CORS: functions use `Access-Control-Allow-Origin: *` in provided Deno (adjust for production if needed)
