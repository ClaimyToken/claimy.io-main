# Simple “vault” withdrawals (hot wallet)

Use this path when you **do not** want to run the Anchor **`claimy-vault`** program yet. The repo still contains the PDA program and the full PDA branch in `withdraw-spl`; you only configure Edge secrets differently.

## What it does

- You hold a **normal Solana keypair** (your “vault”) with:
  - **SOL** for transaction fees
  - **Claimy SPL** in that wallet’s **associated token account** for your mint (e.g. your ~15% supply on mainnet)
- `withdraw-spl` verifies the user’s **Phantom `signMessage`** as today, then builds a standard **SPL Token transfer** from **your vault ATA → user’s ATA** for the same mint.

## Supabase secrets

Set (in addition to `SUPABASE_*`, `CLAIMY_SPL_MINT`, `SOLANA_RPC_URL`):

| Secret | Value |
|--------|--------|
| `CLAIMY_SIMPLE_VAULT_PRIVATE_KEY` | Base58 secret key **or** JSON byte array `[...]` — same format as `CLAIMY_RELAYER_PRIVATE_KEY` |

**Do not** set `CLAIMY_SIMPLE_VAULT_PRIVATE_KEY` if you want the PDA path; if both simple and PDA secrets exist, **simple wins**.

For **PDA** mode instead, use `CLAIMY_VAULT_PROGRAM_ID` + `CLAIMY_RELAYER_PRIVATE_KEY` and leave simple unset.

## Operational checklist

1. **Mint** in the app and in `CLAIMY_SPL_MINT` match mainnet (or your chosen cluster).
2. **RPC** (`SOLANA_RPC_URL`) points at the **same cluster** as the mint.
3. Vault wallet has an **ATA** for that mint with enough balance for payouts.
4. Vault wallet has **SOL** for fees (small amount per withdrawal).

## Deposits (credits)

User **custodial deposit addresses** are unchanged. The Angular app loads **Claimy Credits** by reading the **SPL balance** of the deposit wallet for that mint (`ClaimyCreditsService`). When users send Claimy SPL to their deposit address, **Refresh** in the wallet modal reflects it — no on-chain sweep into the vault wallet is required for the balance to show.

## Security

- `CLAIMY_SIMPLE_VAULT_PRIVATE_KEY` is **full custody** of whatever SOL and SPL sit in that wallet. Store only in Supabase Edge secrets (or your backend), never in the browser.
