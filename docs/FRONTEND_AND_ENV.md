# Angular app — env & config

---

## Local development

1. Copy **`env.template`** from the **repo root** → **`.env`** (same folder as `package.json`).
2. Fill:
   - `CLAIMY_SOLANA_RPC_URL` — RPC for **same cluster** as mint (mainnet vs devnet).
   - `CLAIMY_SPL_MINT` — Claimy SPL mint base58.
   - `CLAIMY_SUPABASE_URL` — optional override; else defaults in `src/environments/environment.ts`.
3. Run **`npm run env:sync`** from the repo root (or **`scripts/sync-env.cmd`** / **`scripts/start-dev.cmd`** on Windows) to regenerate **`src/environments/env.overrides.ts`**.
4. **`ng serve`** or **`node node_modules/@angular/cli/bin/ng.js serve`** if PowerShell blocks `npm.ps1`.

**Never commit `.env`** — it is gitignored.

---

## Production build

**`ng build`** (default configuration) uses **`src/environments/environment.prod.ts`** — **not** `.env`. Set `supabaseUrl`, `solanaRpcUrl`, `claimySplMintAddress` there (or inject via your CI/CD).

---

## Services (reference)

| File | Role |
|------|------|
| `src/app/services/config.service.ts` | Reads `environment` for Supabase URL, RPC, mint |
| `src/app/services/claimy-edge.service.ts` | `account-linked-wallet`, `withdraw-spl` URLs |
| `src/app/modules/pages/login/login.component.ts` | `wallet-login` |
| `src/app/modules/pages/register/register.component.ts` | `check-username`, `register-phantom` |

All Supabase function URLs are `{supabaseUrl}/functions/v1/{slug}`.

---

## What is safe in the browser

RPC URLs with **API keys** and **mint** are **bundled into the client**. Treat keys as **public**; use provider limits or a backend RPC proxy for production if needed.

**Never** put `CLAIMY_RELAYER_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `DEPOSIT_WALLET_ENCRYPTION_KEY` in the Angular app.
