import { Injectable } from '@angular/core';

export interface RankTierDef {
  tierLabel: string;
  league: 'Bronze' | 'Iron' | 'Gold' | 'Emerald' | 'Diamond';
  /** Cumulative lifetime SPL-equivalent wagered (Claimy staked) to reach this tier. */
  minLifetimeSplWagered: number;
  /** Payout multiplier ×1000 (e.g. 1914 = 1.914×). */
  multiplierMilli: number;
}

@Injectable({
  providedIn: 'root'
})
export class RankLadderService {
  /**
   * Ordered lowest → highest. Same schedule as the Leaderboards page.
   */
  readonly tiers: readonly RankTierDef[] = [
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

  /** Highest tier at or below this lifetime wager volume. */
  tierForLifetimeWagered(volume: number): RankTierDef {
    const v = Math.max(0, Number(volume) || 0);
    let current = this.tiers[0];
    for (const t of this.tiers) {
      if (t.minLifetimeSplWagered <= v) {
        current = t;
      } else {
        break;
      }
    }
    return current;
  }

  /** Next tier above `tier`, or null if already at max. */
  nextTierAfter(tier: RankTierDef): RankTierDef | null {
    const idx = this.tiers.findIndex((t) => t.tierLabel === tier.tierLabel);
    if (idx < 0 || idx >= this.tiers.length - 1) {
      return null;
    }
    return this.tiers[idx + 1];
  }

  /**
   * Progress within the span from current tier floor toward the next tier threshold, 0–100.
   * At max tier, returns 100.
   */
  progressPercentTowardNext(volume: number, current: RankTierDef): number {
    const next = this.nextTierAfter(current);
    if (!next) {
      return 100;
    }
    const v = Math.max(0, Number(volume) || 0);
    const low = current.minLifetimeSplWagered;
    const high = next.minLifetimeSplWagered;
    if (high <= low) {
      return 100;
    }
    const pct = ((v - low) / (high - low)) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  /** CSS modifier for league color (e.g. `rank-league--gold`). */
  leagueModifier(league: RankTierDef['league']): string {
    return league.toLowerCase();
  }

  multiplierDisplay(milli: number): number {
    return milli / 1000;
  }

  winProfitPerUnitStaked(milli: number): string {
    return ((milli - 1000) / 1000).toFixed(3);
  }

  tierIndex(tier: RankTierDef | null | undefined): number {
    if (!tier) return -1;
    return this.tiers.findIndex((t) => t.tierLabel === tier.tierLabel);
  }
}
