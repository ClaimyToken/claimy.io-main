# Testing deposits (Claimy Credits)

**Deposits** are **on-chain**: users send **Claimy SPL** (your configured mint) to their **custodial deposit address**. The app does not need a server job for the balance to show — it reads the SPL balance over RPC (`getTokenAccountsByOwner`), same as **Refresh** in the wallet modal.

## Prerequisites

1. **`env.template` → `.env`** with **`CLAIMY_SOLANA_RPC_URL`** and **`CLAIMY_SPL_MINT`** (same cluster as the token, e.g. mainnet).
2. Run **`npm run env:sync`** so the Angular app picks up RPC + mint.
3. Logged-in user with a **deposit address** (from registration with custodial wallet enabled).

## Manual test (recommended)

1. Open the app → **Your wallet** (or account settings if the deposit address is shown there).
2. Expand **Deposit Claimy** and copy **Your deposit address** (custodial wallet).
3. In **Phantom**, send a **small** amount of **Claimy SPL** **from** a wallet that already holds that token **to** the pasted deposit address.  
   - Use the **same mint** as `CLAIMY_SPL_MINT` / the mint shown in the modal.
4. Wait for confirmation on-chain.
5. In the app, tap **Refresh** (icon) next to **Claimy Credits** — the number should match what you expect from the send (minus fees is not applicable to SPL amount on the receiving ATA).

If the balance stays **0**, check: wrong mint, wrong cluster (devnet vs mainnet), RPC URL, or transaction not confirmed yet.

## CLI check (matches the app)

From the **repo root**, with `.env` loaded:

```bash
npm run check-deposit -- <DEPOSIT_WALLET_PUBLIC_KEY>
```

Example:

```bash
npm run check-deposit -- 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

Override RPC/mint without editing `.env`:

```bash
node scripts/check-deposit-balance.cjs --rpc "https://..." --mint "YourMintPubkey" <DEPOSIT_WALLET_PUBLIC_KEY>
```

The printed **human / UI amount** should match **Claimy Credits** in the UI after **Refresh**.

## SQL (optional)

`DEVELOPERWORK/supabase-verify.sql` confirms users have `deposit_wallet_public_key` set. It does **not** read chain balances — use the CLI or the app for that.
