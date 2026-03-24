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
      subtitle: 'Hosting & routing',
      bullets: [
        'Site is deployed on Netlify with the correct publish folder (`dist/claimy`) and Node 18 for builds.',
        'Added an SPA fallback so deep links like `/home` and `/playhouse` load the app instead of a 404 when opened directly or refreshed.',
        'Documented that local `.env` is not pushed to git; production builds use `environment.prod.ts`.'
      ]
    },
    {
      dateLabel: '22 March 2026',
      isoDate: '2026-03-22',
      subtitle: 'Credits API & wallet history',
      bullets: [
        'Browser calls to the `claimy-credits` Edge function now send the Supabase anon key (`apikey` + `Authorization`), matching other Edge calls — fixes "Failed to fetch" for credit history and balance in production.',
        'Tightened CORS on `claimy-credits` (allowed methods for preflight).',
        'Same header pattern applied to referrals, withdraw request helper, and related fetches for consistent gateway behaviour.'
      ]
    },
    {
      dateLabel: '20 March 2026',
      isoDate: '2026-03-20',
      subtitle: 'Playhouse — live feed & UI',
      bullets: [
        'The Playhouse "Recent bets" table uses live data: settled Flowerpoker rounds from the database (not placeholder copy).',
        'Provably Fair modal shows stored fairness fields and supports in-browser verification when the round is complete.',
        'Logged-in users can filter to "My bets only"; pagination when there are many rows.',
        'Backend: `playhouse_list_settled_bets` RPC, `playhouse-feed` Edge function, and `verify_jwt = false` for the public feed in `supabase/config.toml`.',
        'Game lineup cards: orange glow titles, centered in each card; short blurbs removed; hover on "Play … now" gently lights the card border.'
      ]
    },
    {
      dateLabel: '19 March 2026',
      isoDate: '2026-03-19',
      subtitle: 'Build & tooling',
      bullets: [
        'Production bundle and component style budgets in `angular.json` raised so `ng build` completes without failing on SCSS size.',
        '`package.json` `start` / `build` invoke the local Angular CLI via `node` so Windows users do not need a global `ng` on PATH.'
      ]
    }
  ];
}
