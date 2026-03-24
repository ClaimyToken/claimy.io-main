import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ClaimyEdgeService } from './claimy-edge.service';
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
  /** True only on the first fetch when no snapshot exists yet (shows skeleton line; avoids layout jump on refresh). */
  loading = false;
  /** True during any in-flight fetch (initial or refresh). Use to disable the Refresh button. */
  refreshInProgress = false;
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
    this.refreshInProgress = false;
  }

  async refresh(): Promise<void> {
    const w = this.walletAuth.walletAddress?.trim();
    if (!w) {
      this.snapshot$.next(null);
      return;
    }
    const hadSnapshot = this.snapshot$.value !== null;
    this.error = null;
    if (!hadSnapshot) {
      this.loading = true;
    }
    this.refreshInProgress = true;
    try {
      const res = await this.edge.fetchPlayerRankingStats(w);
      if (!res.ok) {
        throw new Error(res.error ?? 'Could not load ranking stats.');
      }
      const lifetimeWagered = res.lifetimeWagered ?? 0;
      const currentTier = this.ranks.tierForLifetimeWagered(lifetimeWagered);
      const nextTier = this.ranks.nextTierAfter(currentTier);
      const progressToNextPercent = this.ranks.progressPercentTowardNext(lifetimeWagered, currentTier);

      this.snapshot$.next({
        lifetimeWagered,
        betsSettled: res.betsSettled ?? 0,
        wins: res.wins ?? 0,
        losses: res.losses ?? 0,
        ties: res.ties ?? 0,
        pnl: res.pnl ?? 0,
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
      this.refreshInProgress = false;
    }
  }
}
