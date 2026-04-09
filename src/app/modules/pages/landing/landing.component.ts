import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ConfigService } from 'src/app/services/config.service';
import { PumpfunTokenStatsService } from 'src/app/services/pumpfun-token-stats.service';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit, OnDestroy {

  constructor(
    public configService: ConfigService,
    private readonly pumpStats: PumpfunTokenStatsService
  ) { }

  currentYear: number = new Date().getFullYear();
  private statsSub: Subscription | null = null;
  token24hVolumeLiveLabel = '—';
  tokenMarketCapLiveLabel = '—';

  ngOnInit(): void {
    const mint = this.configService.claimyTokenMint;
    if (!mint) return;
    this.pumpStats.startForMint(mint);
    this.statsSub = this.pumpStats.stats$.subscribe((s) => {
      this.token24hVolumeLiveLabel =
        typeof s.volume24hSol === 'number' && Number.isFinite(s.volume24hSol)
          ? `${s.volume24hSol.toFixed(2)} SOL`
          : '—';
      this.tokenMarketCapLiveLabel = this.formatMarketCapLabel(s.marketCapUsd);
    });
  }

  ngOnDestroy(): void {
    this.pumpStats.stop();
    if (this.statsSub) {
      this.statsSub.unsubscribe();
      this.statsSub = null;
    }
  }

  /** Compact label for the GitHub card (full URL on hover via title on the link). */
  get githubRepoPath(): string {
    return this.configService.githubLink.replace(/^https?:\/\/github\.com\//i, '');
  }

  /** `usd_market_cap` from pump.fun only — no SOL mcap in the UI. */
  private formatMarketCapLabel(usd: number | null): string {
    const usdOk = typeof usd === 'number' && Number.isFinite(usd) && usd > 0;
    return usdOk ? this.formatUsdCompact(usd) : '—';
  }

  private formatUsdCompact(n: number): string {
    const x = Math.abs(n);
    if (x >= 1e9) return `~$${(n / 1e9).toFixed(2)}B`;
    if (x >= 1e6) return `~$${(n / 1e6).toFixed(2)}M`;
    if (x >= 1e3) return `~$${(n / 1e3).toFixed(2)}K`;
    return `~$${n.toFixed(0)}`;
  }
}
