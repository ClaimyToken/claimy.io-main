# `claimy-vault` (Anchor)

On-chain vault for Claimy SPL: a **PDA**-owned token account holds protocol liquidity (e.g. 15% of supply). Withdrawals to users use **CPI + `invoke_signed`** with vault seeds — see [Solana PDAs](https://solana.com/docs/core/pda).

## Build

Requires [Anchor](https://www.anchor-lang.com/docs/installation) + Solana CLI + Rust.

```bash
cd programs/claimy-vault
anchor build
# or from repo root:
anchor build
```

After deploying to devnet/mainnet, run `anchor keys sync` so `declare_id!` and `Anchor.toml` match your program id.

## Instructions

| Instruction        | Who signs | Effect |
|--------------------|-----------|--------|
| `initialize`       | Payer     | Creates `vault_state` PDA, vault authority PDA, empty vault SPL ATA. Sets `relayer` pubkey. |
| `withdraw_to_user` | Relayer   | SPL transfer vault ATA → user ATA (same mint). User must already have ATA for the mint. |

## Relayer

The **relayer** is a normal keypair (e.g. held only on the server / Edge Function secret). It is **not** the PDA — it only authorizes calling `withdraw_to_user`. The **vault PDA** signs the actual token transfer via the program.

## PDAs (per mint)

- **State:** seeds `["state", mint]`
- **Vault authority:** seeds `["vault", mint]` (owner of vault token account)

From repo root, after `npm install`:

```bash
node scripts/derive-claimy-vault-pdas.cjs <PROGRAM_ID> <MINT_PUBKEY>
```
