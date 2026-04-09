import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Subscription, of, timer } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { ConfigService } from './config.service';

/** Live token stats: pump.fun coin payload (via Edge proxy) + optional DexScreener 24h volume. */
export type PumpfunTokenStats = {
  marketCapSol: number | null;
  /** From pump.fun `usd_market_cap` (matches ~$2.46K style displays). */
  marketCapUsd: number | null;
  volume24hSol: number | null;
  lastUpdatedAt: number | null;
};

type PumpfunCoinDto = {
  market_cap?: number;
  usd_market_cap?: number;
};

type DexscreenerTokenResponse = {
  pairs?: Array<{ volume?: { h24?: number } }> | null;
};

const DEXSCREENER_TOKENS = 'https://api.dexscreener.com/latest/dex/tokens';

@Injectable({
  providedIn: 'root'
})
export class PumpfunTokenStatsService {
  private pollSub: Subscription | null = null;
  private activeMint: string | null = null;

  readonly stats$ = new BehaviorSubject<PumpfunTokenStats>({
    marketCapSol: null,
    marketCapUsd: null,
    volume24hSol: null,
    lastUpdatedAt: null
  });

  constructor(
    private readonly http: HttpClient,
    private readonly config: ConfigService
  ) {}

  startForMint(mint: string): void {
    const m = (mint ?? '').trim();
    if (!m) {
      this.stop();
      return;
    }
    this.activeMint = m;
    this.pollSub?.unsubscribe();
    this.pollSub = timer(0, 20_000)
      .pipe(switchMap(() => this.fetchOnce(m)))
      .subscribe();
  }

  stop(): void {
    this.activeMint = null;
    this.pollSub?.unsubscribe();
    this.pollSub = null;
    this.stats$.next({
      marketCapSol: null,
      marketCapUsd: null,
      volume24hSol: null,
      lastUpdatedAt: null
    });
  }

  private edgeHeaders(): HttpHeaders {
    const anon = this.config.supabaseAnonKey?.trim();
    const h: Record<string, string> = { Accept: 'application/json' };
    if (anon) {
      h['apikey'] = anon;
      h['Authorization'] = `Bearer ${anon}`;
    }
    return new HttpHeaders(h);
  }

  private pumpfunProxyUrl(mint: string): string {
    const base = this.config.supabaseUrl.replace(/\/$/, '');
    const q = new URLSearchParams({ mint, sync: 'true' });
    return `${base}/functions/v1/pumpfun-token-proxy?${q.toString()}`;
  }

  private fetchOnce(mint: string) {
    if (this.activeMint !== mint) {
      return of(null);
    }
    return this.http.get<PumpfunCoinDto>(this.pumpfunProxyUrl(mint), { headers: this.edgeHeaders() }).pipe(
      switchMap((coin) =>
        this.http.get<DexscreenerTokenResponse>(`${DEXSCREENER_TOKENS}/${encodeURIComponent(mint)}`).pipe(
          catchError(() => of<DexscreenerTokenResponse>({ pairs: null })),
          map((dex) => ({ coin, dex }))
        )
      ),
      tap(({ coin, dex }) => this.applyStats(coin, dex)),
      catchError(() => {
        this.stats$.next({
          marketCapSol: null,
          marketCapUsd: null,
          volume24hSol: null,
          lastUpdatedAt: Date.now()
        });
        return of(null);
      })
    );
  }

  private applyStats(coin: PumpfunCoinDto, dex: DexscreenerTokenResponse): void {
    const mcapSol =
      typeof coin.market_cap === 'number' && Number.isFinite(coin.market_cap) ? coin.market_cap : null;
    const usdMcap =
      typeof coin.usd_market_cap === 'number' && Number.isFinite(coin.usd_market_cap)
        ? coin.usd_market_cap
        : null;

    const volUsd = dex.pairs?.[0]?.volume?.h24;
    let volume24hSol: number | null = null;
    if (
      typeof volUsd === 'number' &&
      Number.isFinite(volUsd) &&
      volUsd > 0 &&
      mcapSol &&
      mcapSol > 0 &&
      usdMcap &&
      usdMcap > 0
    ) {
      const solUsd = usdMcap / mcapSol;
      volume24hSol = volUsd / solUsd;
    }

    this.stats$.next({
      marketCapSol: mcapSol,
      marketCapUsd: usdMcap,
      volume24hSol,
      lastUpdatedAt: Date.now()
    });
  }
}
