import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ConfigService } from 'src/app/services/config.service';
import { PumpportalTokenStatsService } from 'src/app/services/pumpportal-token-stats.service';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit, OnDestroy {

  constructor(
    public configService: ConfigService,
    private readonly pumpStats: PumpportalTokenStatsService
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
      this.tokenMarketCapLiveLabel =
        typeof s.marketCapSol === 'number' && Number.isFinite(s.marketCapSol)
          ? `${s.marketCapSol.toFixed(2)} SOL`
          : '—';
    });
  }

  ngOnDestroy(): void {
    if (this.statsSub) {
      this.statsSub.unsubscribe();
      this.statsSub = null;
    }
  }

  /** Compact label for the GitHub card (full URL on hover via title on the link). */
  get githubRepoPath(): string {
    return this.configService.githubLink.replace(/^https?:\/\/github\.com\//i, '');
  }
}
