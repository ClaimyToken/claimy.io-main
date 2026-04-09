# Claimy API demo (static)

Minimal **vanilla HTML/JS** to exercise the same Supabase Edge calls the Angular app uses — useful for integrators who want mechanics without the full frontend.

## What it does

- **`claimy-credits`** — `get` (playable balance), `list_ledger` (credit history), optional `sync_from_chain` (reconcile DB vs custodial deposit ATA; **updates** balance server-side).
- **`bankroll-info`** — `GET` max-stake / bankroll snapshot (if deployed).

Headers match the app: `apikey` + `Authorization: Bearer <anon public key>` (see `ClaimyEdgeService` in the main repo).

## Run locally

Do **not** rely on `file://` — use any static server from this folder:

```bash
cd demo
npx --yes serve -l 3333
```

From the **repository root** you can run:

```bash
npm run demo
```

Then open **http://localhost:3333** (or use VS Code Live Server, `python -m http.server`, etc.).

## Configuration

1. **Supabase URL** — Project Settings → API → Project URL (no trailing slash).
2. **Anon public key** — Project Settings → API → `anon` `public` — safe to use in the browser; protected by RLS and Edge logic (same as the shipped app).
3. **Wallet address** — Base58 Phantom pubkey for a **registered** Claimy user, or use **Connect Phantom** (must be on `http://localhost` or `https` for the extension).

Values are saved in **localStorage** in your browser only (not committed).

## Security note

Use a **dev/staging** project if you are screen-recording. The anon key is public by design, but you still should not reuse production keys in tutorials if you prefer to rotate them after exposure.

## See also

- `../docs/PLAYABLE_CREDITS.md` — `claimy-credits` actions and RPCs.
- `../docs/EDGE_FUNCTIONS.md` — all Edge slugs.
- Menu → **For developers** in the full app for the long-form guide.
