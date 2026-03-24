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
        'Public Supabase anon key is baked into `environment.prod.ts` for browser → Edge calls; no Netlify env vars required for that setup.'
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
