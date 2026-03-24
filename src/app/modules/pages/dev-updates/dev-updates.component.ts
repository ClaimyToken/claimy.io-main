import { Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

/**
 * One release note block — add new entries at the **top** of `entries` (newest first).
 *
 * Workflow: ship something meaningful → add `{ dateLabel, isoDate?, subtitle?, bullets }` above the rest,
 * commit, deploy. Keep bullets short; link to /developers or GitHub for deep detail if needed.
 */
export type DevUpdateEntry = {
  /** Human-readable date for the heading. */
  dateLabel: string;
  /** Machine date for <time datetime> (accessibility). */
  isoDate?: string;
  /** Optional short title under the date. */
  subtitle?: string;
  /** Bullet points; keep them factual and user-facing where possible. */
  bullets: string[];
};

@Component({
  selector: 'app-dev-updates',
  templateUrl: './dev-updates.component.html',
  styleUrls: ['./dev-updates.component.scss']
})
export class DevUpdatesComponent {
  constructor(readonly config: ConfigService) {}

  /**
   * Product / dev log — newest first.
   * To add a ship: copy an entry object, edit, paste above the previous one.
   */
  readonly entries: DevUpdateEntry[] = [
    {
      dateLabel: '24 March 2026',
      isoDate: '2026-03-24',
      subtitle: 'Admin sweep controls + credits-safe reconciliation + live rank-up toasts',
      bullets: [
        'Shipped a whitelist-gated admin sweep tool in Account Settings backed by Edge `admin-sweep-wallets` with `summary_only`, `dry_run`, and `execute` actions.',
        'Sweep UI now supports top-holder selection (`Top holders limit`), scan-all mode, result caching for summary scans, and a modal listing every wallet/amount included in totals.',
        'Added backend debug trace mode for sweeps (destination resolution, selection preview, per-transfer logs, signatures) to troubleshoot routing and execution behavior quickly.',
        'Documented and enforced sweep destination precedence: request override -> `CLAIMY_SWEEP_DESTINATION_WALLET` -> caller wallet; execute path uses `CLAIMY_SWEEP_FEE_PAYER_PRIVATE_KEY` for tx fees.',
        'Fixed post-sweep credit drift by updating `deposit_chain_balance_snapshot` after successful transfer so later `sync_from_chain` reflects true new deposits only.',
        'Ranking UX now refreshes immediately after settled games and shows rank-up toasts (including multi-tier jumps) with updated RTP/payout multiplier in the nav.'
      ]
    },
    {
      dateLabel: '24 March 2026',
      isoDate: '2026-03-24',
      subtitle: 'Blackjack launch + fairness polish + live token metrics',
      bullets: [
        'Blackjack is now live end-to-end: Edge function (`blackjack-game`), stake lock/settle via credits ledger, and full round/session persistence in `claimy_game_sessions`.',
        'Added full Blackjack table flow in the app: bet, hit, stand, double, insurance, round log, and refresh-safe resume.',
        'Provably fair extended for Blackjack with browser-side verification checks (commit hash, shuffle digest, and deal-order comparison when cards are available).',
        'Major UI pass on Blackjack: larger centered cards, staged 1-second deal animation, face-down dealer hole card, static table sizing, and controls that stay mounted to avoid layout jumps.',
        'Landing page metrics now consume PumpPortal real-time stream for Claimy token: current market cap (SOL) and rolling 24h volume (SOL) cards.',
        'Playhouse and ranking docs updated to include Blackjack sessions and latest migration path (`claimy_playhouse_include_blackjack.sql`).'
      ]
    },
    {
      dateLabel: '24 March 2026',
      isoDate: '2026-03-24',
      subtitle: 'Playhouse feed recovery + auth UX pass',
      bullets: [
        'Fixed Playhouse feed fetch path and deployment workflow: the core issue was Edge slug/deploy mismatch (`OPTIONS .../playhouse-feed` returned 404 until function was deployed under the exact slug).',
        'Feed now calls Edge via standard `fetch` with explicit headers and clearer browser-facing error hints for network/ad-blocker/project mismatch cases.',
        'Updated Playhouse feed SQL + UI behavior: public view remains settled-only; logged-in “My bets only” can include in-progress sessions so unfinished rounds are visible while testing.',
        'Registration flow simplified from four boxes to three by merging connect/sign, plus one-click “Connect & sign” action.',
        'Login UX upgraded: reusable login form + global login modal from navigation/guards so users can sign in without losing their current page context.'
      ]
    },
    {
      dateLabel: '25 March 2026',
      isoDate: '2026-03-25',
      subtitle: 'Development blog — layout & changelog',
      bullets: [
        'This page is wider on large screens and uses slightly smaller type for titles and body text so more fits on screen.',
        'Changelog expanded below with a fuller history of recent ships (Playhouse, APIs, Netlify, builds).',
        'Reminder: add new posts at the top of `entries` in this file; optional `isoDate` powers the `<time datetime>` for accessibility.'
      ]
    },
    {
      dateLabel: '24 March 2026',
      isoDate: '2026-03-24',
      subtitle: 'Netlify & environment model',
      bullets: [
        'Added `netlify.toml`: build `npm run build`, publish `dist/claimy` (matches `angular.json` output), `NODE_VERSION = 18`.',
        'SPA redirect: `/*` → `/index.html` with status 200 so routes like `/home`, `/updates`, `/playhouse` work on refresh and direct links (fixes Netlify “Page not found”).',
        'Local secrets live in `.env` (gitignored); `node scripts/sync-env.cjs` writes `env.overrides.ts` for dev. Production bundles use `environment.prod.ts` — Netlify does not read `.env` unless you wire a custom build step.',
        'Public Supabase anon key is baked into `environment.prod.ts` for browser → Edge calls; no Netlify env vars required for that setup.',
        'Solana: the browser bundle uses public mainnet RPC only. Shyft (or any keyed RPC) is configured as `SOLANA_RPC_URL` on Supabase Edge functions — not in Netlify or the frontend bundle.'
      ]
    },
    {
      dateLabel: '22 March 2026',
      isoDate: '2026-03-22',
      subtitle: 'Supabase gateway, credits & other Edge calls',
      bullets: [
        '`claimy-credits` requests (`get`, `sync_from_chain`, `list_ledger`) now send the same `apikey` + `Authorization: Bearer <anon>` headers as Flowerpoker — fixes masked “Failed to fetch” / CORS-style failures when the gateway rejected unsigned browser calls.',
        'Extended that header pattern to `claimy-referrals`, `withdraw-spl`, and `account-linked-wallet` fetches for consistency.',
        '`claimy-credits` Edge: `Access-Control-Allow-Methods: POST, OPTIONS` on CORS for preflight.',
        '`fetchCreditLedger` returns a clear error if the anon key is missing instead of a cryptic network failure.',
        'Production fix: `environment.prod.ts` had an empty `supabaseAnonKey`; filled with the public anon key so production builds (e.g. Netlify) send valid headers to all Edge functions.'
      ]
    },
    {
      dateLabel: '20 March 2026',
      isoDate: '2026-03-20',
      subtitle: 'Playhouse — live bet feed & fairness',
      bullets: [
        'Replaced placeholder “recent bets” with live data: Postgres RPC `playhouse_list_settled_bets` over settled Flowerpoker rows in `claimy_game_sessions` (joined to users for display names).',
        'New Edge function `playhouse-feed`: action `list_bets` with pagination and optional wallet filter.',
        '`ClaimyEdgeService.fetchPlayhouseBets` + `PlayhouseBetRow` types; Playhouse table shows stake, payout, result, settled time, Provably Fair action.',
        'Logged-in users: “My bets only” filter. Pager when there are more rows than one page.',
        'Provably Fair modal: fairness fields from stored metadata; “Verify in browser” via `verifyFlowerpokerRound` when reveal + `finalRound` exist.',
        '`supabase/config.toml`: `[functions.playhouse-feed] verify_jwt = false` so the public feed does not require a user JWT (still uses service role server-side only).',
        '`playhouse-feed` CORS includes allowed methods; README documents deploy + migration `DEVELOPERWORK/migrations/claimy_playhouse_feed.sql`.',
        'Note: only **settled** rounds appear — games must finish the settle step in Flowerpoker; in-progress sessions are excluded.',
        'Playhouse game lineup cards: orange glow titles (`text-primary`, `c-text-glow`), centered in each card; marketing blurbs removed; hover on “Play … now” gently glows the card border (`:has()` on the CTA).'
      ]
    },
    {
      dateLabel: '19 March 2026',
      isoDate: '2026-03-19',
      subtitle: 'Build, budgets & Windows dev UX',
      bullets: [
        '`angular.json` production budgets relaxed: larger `initial` bundle cap and `anyComponentStyle` so component SCSS over 8kb (e.g. wallet modal, Flowerpoker) does not fail the build.',
        '`package.json` `start` and `build` call the local CLI via `node node_modules/@angular/cli/bin/ng.js` so you do not need a global `ng` on PATH.',
        'On Windows, `npm` can be invoked as `npm.cmd` if PowerShell blocks `npm.ps1`; Command Prompt avoids execution-policy issues; `node …/ng.js build` works everywhere.'
      ]
    }
  ];
}
