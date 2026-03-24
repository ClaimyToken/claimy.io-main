import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type PumpPortalTokenStats = {
  marketCapSol: number | null;
  volume24hSol: number;
  lastUpdatedAt: number | null;
};

type TradeEvent = {
  mint?: string;
  txType?: string;
  solAmount?: number;
  marketCapSol?: number;
};

@Injectable({
  providedIn: 'root'
})
export class PumpportalTokenStatsService {
  private readonly wsUrl = 'wss://pumpportal.fun/api/data';
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectBackoffMs = 1500;
  private activeMint: string | null = null;

  private readonly volumeWindowMs = 24 * 60 * 60 * 1000;
  private volumeEvents: Array<{ ts: number; sol: number }> = [];

  readonly stats$ = new BehaviorSubject<PumpPortalTokenStats>({
    marketCapSol: null,
    volume24hSol: 0,
    lastUpdatedAt: null
  });

  startForMint(mint: string): void {
    const m = (mint ?? '').trim();
    if (!m) {
      this.stop();
      return;
    }
    this.activeMint = m;
    this.ensureConnected();
    this.subscribeToken(m);
  }

  stop(): void {
    this.activeMint = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.connected = false;
    this.volumeEvents = [];
    this.stats$.next({
      marketCapSol: null,
      volume24hSol: 0,
      lastUpdatedAt: null
    });
  }

  private ensureConnected(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.ws = new WebSocket(this.wsUrl);
    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectBackoffMs = 1500;
      if (this.activeMint) {
        this.subscribeToken(this.activeMint);
      }
    };
    this.ws.onmessage = (ev) => this.handleMessage(ev.data);
    this.ws.onerror = () => {
      this.connected = false;
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.activeMint) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const wait = this.reconnectBackoffMs;
    this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 1.7, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, wait);
  }

  private subscribeToken(mint: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          method: 'subscribeTokenTrade',
          keys: [mint]
        })
      );
    } catch {
      /* ignore */
    }
  }

  private handleMessage(data: unknown): void {
    const raw = typeof data === 'string' ? data : '';
    if (!raw) return;
    let evt: TradeEvent | null = null;
    try {
      evt = JSON.parse(raw) as TradeEvent;
    } catch {
      return;
    }
    if (!evt || typeof evt !== 'object') return;
    if (!this.activeMint) return;
    if ((evt.mint ?? '') !== this.activeMint) return;

    const now = Date.now();
    const prev = this.stats$.value;
    let nextMarketCap = prev.marketCapSol;
    if (typeof evt.marketCapSol === 'number' && Number.isFinite(evt.marketCapSol)) {
      nextMarketCap = evt.marketCapSol;
    }

    const txType = String(evt.txType ?? '').toLowerCase();
    if ((txType === 'buy' || txType === 'sell') && typeof evt.solAmount === 'number' && Number.isFinite(evt.solAmount)) {
      this.volumeEvents.push({ ts: now, sol: Math.max(0, evt.solAmount) });
    }
    this.trimVolumeWindow(now);

    const volume24hSol = this.volumeEvents.reduce((s, v) => s + v.sol, 0);
    this.stats$.next({
      marketCapSol: nextMarketCap,
      volume24hSol,
      lastUpdatedAt: now
    });
  }

  private trimVolumeWindow(now: number): void {
    const cutoff = now - this.volumeWindowMs;
    while (this.volumeEvents.length > 0 && this.volumeEvents[0]!.ts < cutoff) {
      this.volumeEvents.shift();
    }
  }
}

