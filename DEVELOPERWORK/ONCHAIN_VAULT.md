# On-chain vault (`claimy-vault`) — developer steps

Anchor program path: **`programs/claimy-vault/`**  
Workspace: **`Anchor.toml`** (repo root)

Full architecture narrative: **`DEVELOPERWORK/CLAIMY_VAULT.md`**.

---

## What the program does

- **`initialize(relayer: Pubkey)`** (once per mint): creates `vault_state` PDA (`["state", mint]`), vault authority PDA (`["vault", mint]`), and **vault SPL token account** (ATA owned by vault PDA). Stores **relayer** pubkey in on-chain state.
- **`withdraw_to_user(amount: u64)`**: **relayer** signs the tx; program CPI-transfers SPL from **vault ATA** → **user ATA** (same mint). User must own the destination ATA.

**PDAs / ATA helper (Node, from repo root):**

```bash
npm install
npm run vault:pdas -- <PROGRAM_ID> <MINT_PUBKEY>
```

---

## Toolchain (typical)

- **Rust** (`rustup`)
- **Solana CLI** (install script from `release.solana.com` or **anza** release, or GitHub tarball if corporate SSL blocks install URLs — see team notes)
- **Anchor** matching `Anchor.toml` (e.g. `avm install 0.30.1`)

**Windows:** use **WSL2 + Ubuntu** for Solana/Anchor unless you have a known-good native setup.

---

## Deploy flow (summary)

1. `cd` to repo root (in WSL: `/mnt/c/.../claimy.io-main`).
2. `anchor keys sync` — aligns `declare_id!` with deploy keypair.
3. `anchor build`
4. `solana config set --url <devnet|mainnet>` to match your Claimy mint.
5. `anchor deploy --provider.cluster <devnet|mainnet>`
6. Put deployed **program id** in Supabase secret **`CLAIMY_VAULT_PROGRAM_ID`**.

---

## `initialize` (mandatory once per mint)

You must send **one** successful `initialize` instruction with:

- Payer (funded with SOL)
- Correct **mint** account
- **`relayer`** argument = **public key** of the keypair whose secret will be **`CLAIMY_RELAYER_PRIVATE_KEY`** in Edge

Options: small Anchor test, TS script using `@coral-xyz/anchor`, or internal tooling. The repo does not ship a one-click init script yet; add one if the team wants less friction.

---

## After `initialize`

1. **Fund vault ATA** with Claimy SPL (e.g. 15% supply) — address from `vault:pdas` output.
2. **Fund relayer** with SOL on the same cluster.
3. Users need a **user ATA** for the mint (Phantom usually creates on first receive).

---

## Edge function integration

**`supabase/functions/withdraw-spl/index.ts`** builds legacy `Transaction` + `withdraw_to_user` instruction data:

- Discriminator = first 8 bytes of `SHA-256("global:withdraw_to_user")` = `35c30c46bdbb5d5c` (hex)
- Args: `amount` as **u64 little-endian** in **raw token units** (respects mint decimals).

Program id in that tx **must** match deployed binary (same as `declare_id!` after sync).

---

## Security notes

- Relayer key is **hot** — protect Edge secrets, rotate if leaked.
- **Credits / business limits** are **not** enforced in the Rust program; add checks in Edge or DB before calling withdraw if you cap user withdrawals.
