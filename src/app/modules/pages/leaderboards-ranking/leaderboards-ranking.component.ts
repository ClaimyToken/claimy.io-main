import { Component } from '@angular/core';

export interface RankTierRow {
  tierLabel: string;
  league: string;
  /** Cumulative lifetime SPL tokens wagered required to hold this tier (bet volume, not deposits). */
  minLifetimeSplWagered: number;
  /** Payout multiplier ×1000 (e.g. 1914 = 1.914×) for exact decimals. */
  multiplierMilli: number;
}

@Component({
  selector: 'app-leaderboards-ranking',
  templateUrl: './leaderboards-ranking.component.html',
  styleUrls: ['./leaderboards-ranking.component.scss']
})
export class LeaderboardsRankingComponent {
  /**
   * Everyone starts at Bronze III (base ~1.90×). Higher tiers need more lifetime bet volume; gaps widen as you climb.
   * Product-facing targets — connect to backend when the feature ships.
   */
  readonly tiers: RankTierRow[] = [
    { tierLabel: 'Bronze III', league: 'Bronze', minLifetimeSplWagered: 0, multiplierMilli: 1900 },
    { tierLabel: 'Bronze II', league: 'Bronze', minLifetimeSplWagered: 250, multiplierMilli: 1901 },
    { tierLabel: 'Bronze I', league: 'Bronze', minLifetimeSplWagered: 750, multiplierMilli: 1902 },
    { tierLabel: 'Iron III', league: 'Iron', minLifetimeSplWagered: 2000, multiplierMilli: 1903 },
    { tierLabel: 'Iron II', league: 'Iron', minLifetimeSplWagered: 5000, multiplierMilli: 1904 },
    { tierLabel: 'Iron I', league: 'Iron', minLifetimeSplWagered: 12500, multiplierMilli: 1905 },
    { tierLabel: 'Gold III', league: 'Gold', minLifetimeSplWagered: 31000, multiplierMilli: 1906 },
    { tierLabel: 'Gold II', league: 'Gold', minLifetimeSplWagered: 78000, multiplierMilli: 1907 },
    { tierLabel: 'Gold I', league: 'Gold', minLifetimeSplWagered: 195000, multiplierMilli: 1908 },
    { tierLabel: 'Emerald III', league: 'Emerald', minLifetimeSplWagered: 485000, multiplierMilli: 1909 },
    { tierLabel: 'Emerald II', league: 'Emerald', minLifetimeSplWagered: 1210000, multiplierMilli: 1910 },
    { tierLabel: 'Emerald I', league: 'Emerald', minLifetimeSplWagered: 3025000, multiplierMilli: 1911 },
    { tierLabel: 'Diamond III', league: 'Diamond', minLifetimeSplWagered: 7560000, multiplierMilli: 1912 },
    { tierLabel: 'Diamond II', league: 'Diamond', minLifetimeSplWagered: 18900000, multiplierMilli: 1913 },
    { tierLabel: 'Diamond I', league: 'Diamond', minLifetimeSplWagered: 47250000, multiplierMilli: 1914 }
  ];

  multiplierDisplay(milli: number): number {
    return milli / 1000;
  }

  winProfitPerUnitStaked(milli: number): string {
    return ((milli - 1000) / 1000).toFixed(3);
  }
}
