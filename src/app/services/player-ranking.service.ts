import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ClaimyEdgeService, PlayhouseBetRow } from './claimy-edge.service';
import { RankLadderService, RankTierDef } from './rank-ladder.service';
import { WalletAuthService } from './wallet-auth.service';

export type PlayerRankingSnapshot = {
  lifetimeWagered: number;
  betsSettled: number;
  wins: number;
  losses: number;
  ties: number;
  pnl: number;
  currentTier: RankTierDef;
  nextTier: RankTierDef | null;
  progressToNextPercent: number;
};

@Injectable({
  providedIn: 'root'
})
export class PlayerRankingService {
  readonly snapshot$ = new BehaviorSubject<PlayerRankingSnapshot | null>(null);
  loading = false;
  error: string | null = null;

  constructor(
    private readonly edge: ClaimyEdgeService,
    private readonly ranks: RankLadderService,
    private readonly walletAuth: WalletAuthService
  ) {
    this.walletAuth.loginSucceeded$.subscribe(() => void this.refresh());
  }

  /** Call when app loads with existing session. */
  initFromSession(): void {
    if (this.walletAuth.isLoggedIn) {
      void this.refresh();
    } else {
      this.snapshot$.next(null);
      this.error = null;
    }
  }

  /** Recompute after logout (walletAuth clears session). */
  clear(): void {
    this.snapshot$.next(null);
    this.error = null;
    this.loading = false;
  }

  async refresh(): Promise<void> {
    const w = this.walletAuth.walletAddress?.trim();
    if (!w) {
      this.snapshot$.next(null);
      return;
    }
    this.loading = true;
    this.error = null;
    try {
      const rows = await this.fetchAllSettledWalletBets(w);
      const agg = this.aggregate(rows);
      const currentTier = this.ranks.tierForLifetimeWagered(agg.lifetimeWagered);
      const nextTier = this.ranks.nextTierAfter(currentTier);
      const progressToNextPercent = this.ranks.progressPercentTowardNext(agg.lifetimeWagered, currentTier);

      this.snapshot$.next({
        lifetimeWagered: agg.lifetimeWagered,
        betsSettled: agg.betsSettled,
        wins: agg.wins,
        losses: agg.losses,
        ties: agg.ties,
        pnl: agg.pnl,
        currentTier,
        nextTier,
        progressToNextPercent
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load ranking data.';
      this.error = msg;
      this.snapshot$.next(null);
    } finally {
      this.loading = false;
    }
  }

  private async fetchAllSettledWalletBets(walletAddress: string): Promise<PlayhouseBetRow[]> {
    const out: PlayhouseBetRow[] = [];
    let page = 1;
    let totalPages = 1;
    const pageSize = 50;
    const maxPages = 500;

    while (page <= totalPages && page <= maxPages) {
      const res = await this.edge.fetchPlayhouseBets({
        page,
        pageSize,
        walletAddress
      });
      if (!res.ok) {
        throw new Error(res.error ?? 'Could not load bet history.');
      }
      totalPages = Math.max(1, res.totalPages ?? 1);
      const rows = res.rows ?? [];
      out.push(...rows);
      page += 1;
      if (rows.length === 0) {
        break;
      }
    }

    return out.filter((r) => (r.sessionStatus ?? '').trim() !== 'in_progress');
  }

  private aggregate(rows: PlayhouseBetRow[]): {
    lifetimeWagered: number;
    betsSettled: number;
    wins: number;
    losses: number;
    ties: number;
    pnl: number;
  } {
    let lifetimeWagered = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pnl = 0;

    for (const r of rows) {
      const stake = r.stakeAmount != null && Number.isFinite(r.stakeAmount) ? Number(r.stakeAmount) : 0;
      const payout = r.payoutAmount != null && Number.isFinite(r.payoutAmount) ? Number(r.payoutAmount) : 0;
      lifetimeWagered += stake;
      pnl += payout - stake;

      const w = (r.winner ?? '').trim();
      if (w === 'Player') {
        wins += 1;
      } else if (w === 'House') {
        losses += 1;
      } else if (w === 'Tie' || w.toLowerCase() === 'tie') {
        ties += 1;
      }
    }

    return {
      lifetimeWagered,
      betsSettled: rows.length,
      wins,
      losses,
      ties,
      pnl
    };
  }
}
