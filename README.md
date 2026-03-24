<p align="center">
  <img src="https://i.imgur.com/K7VniKH.png" alt="Claimy" width="100%" />
</p>

# Claimy.io

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 16.2.1.

## Developer handoff

- **In the app:** Menu → **For developers** (route `/developers`) — long-form guide to running the stack locally, Supabase, Edge Functions, and using your own SPL mint.
- **`DEVELOPERWORK/README.md`** — ordered checklist for whoever deploys Supabase SQL, Edge Functions, Anchor vault, and env. Includes SQL copies and links to all related docs.
- **`DEVELOPERWORK/SUPABASE_SETUP.md`** — full Edge Function sources and Supabase SQL (large reference).
- **`DEVELOPERWORK/CLAIMY_VAULT.md`** — vault architecture (credits, custodial deposits, PDA vault, `withdraw-spl`).
- **`DEVELOPERWORK/TESTING_DEPOSITS.md`** — test Claimy SPL deposits / credits (wallet + `npm run check-deposit`).
- **`DEVELOPERWORK/PLAYABLE_CREDITS.md`** — database playable balance + `claimy-credits` Edge Function.
- **`supabase/functions/README.md`** — slugs for repo Edge functions (including `blackjack-game`, `dice-game`, and `playhouse-feed`) and which SQL migrations to run.

## Current shipped highlights

- **Flowerpoker (live):** bet lifecycle, rerolls, resume flow, and browser-side provably fair verification.
- **Blackjack (live):** bet/hit/stand/double/insurance, animated dealing, static table UI, and verify-round checks.
- **Dice (live):** roll under/over on **1,000 outcomes (0–999)**, fixed-size play surface, provably fair verify, Playhouse + ranking.
- **Playhouse feed:** paginated settled bets + ranking stats RPC; Flowerpoker, Blackjack, and Dice sessions.
- **Admin sweep tools (live):** whitelist-gated Account Settings tab for `summary_only`, `dry_run`, and `execute` custodial sweeps, including top-holder selection, debug trace output, and wallet-level modal details.
- **Live rank-up notifications:** multi-rank jump toasts now trigger after settled hands and include updated tier + RTP/payout multiplier.
- **Landing token metrics:** live PumpPortal-derived **Current Marketcap** and rolling **24h Volume** cards.

## On-chain vault (Claimy SPL)

- **`programs/claimy-vault/`** — Anchor program: `initialize`, `withdraw_to_user`.
- **PDAs:** `npm run vault:pdas -- <PROGRAM_ID> <MINT>` (requires `npm install`).

Build the program with [Anchor](https://www.anchor-lang.com/docs/installation) (`anchor build`). On Windows, Rust/Anchor are often installed via WSL or a dedicated toolchain.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
