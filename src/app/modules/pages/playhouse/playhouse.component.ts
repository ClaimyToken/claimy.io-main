import { Component, OnInit } from '@angular/core';
import {
  ClaimyEdgeService,
  PlayhouseBetRow
} from 'src/app/services/claimy-edge.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';
import {
  FairSnapshot,
  VerificationResult,
  verifyFlowerpokerRound
} from 'src/app/modules/pages/flowerpoker/flowerpoker-provably-fair';

type PlayhouseGameCard = {
  title: string;
  route: string;
};

@Component({
  selector: 'app-playhouse',
  templateUrl: './playhouse.component.html',
  styleUrls: ['./playhouse.component.scss']
})
export class PlayhouseComponent implements OnInit {
  readonly games: PlayhouseGameCard[] = [
    { title: 'Flowerpoker', route: '/flowerpoker' },
    { title: 'Blackjack', route: '/blackjack' },
    { title: 'Dice', route: '/dice' },
    { title: 'Hi-low', route: '/hi-low' }
  ];

  readonly pageSize = 15;

  bets: PlayhouseBetRow[] = [];
  betsLoading = false;
  betsError: string | null = null;
  page = 1;
  total = 0;
  totalPages = 1;
  /** Logged-in only: show only this wallet’s Flowerpoker results. */
  myBetsOnly = false;
  pageInput = '1';

  selectedBet: PlayhouseBetRow | null = null;
  verifying = false;
  verifyReport: VerificationResult | null = null;

  constructor(
    private readonly claimyEdge: ClaimyEdgeService,
    readonly walletAuth: WalletAuthService
  ) {}

  ngOnInit(): void {
    void this.loadBets();
  }

  gameLabel(key: string): string {
    const k = (key ?? '').toLowerCase();
    if (k === 'flowerpoker') return 'Flowerpoker';
    return key || '—';
  }

  /** Outcome from the player’s perspective (or pending until settlement). */
  resultLabel(bet: PlayhouseBetRow): 'Win' | 'Loss' | 'Tie' | 'Pending' {
    const s = (bet.sessionStatus ?? '').trim();
    if (s === 'in_progress') return 'Pending';
    const w = (bet.winner ?? '').trim();
    if (!w) return 'Pending';
    if (w === 'Player') return 'Win';
    if (w === 'House') return 'Loss';
    return 'Tie';
  }

  isPendingBet(bet: PlayhouseBetRow): boolean {
    return this.resultLabel(bet) === 'Pending';
  }

  formatClaimy(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return `${Number(n)} CLAIMY`;
  }

  async loadBets(): Promise<void> {
    this.betsLoading = true;
    this.betsError = null;
    const wallet =
      this.walletAuth.isLoggedIn && this.myBetsOnly
        ? this.walletAuth.walletAddress?.trim() ?? null
        : null;
    const res = await this.claimyEdge.fetchPlayhouseBets({
      page: this.page,
      pageSize: this.pageSize,
      walletAddress: wallet
    });
    this.betsLoading = false;
    if (!res.ok) {
      this.betsError = res.error ?? 'Could not load bets.';
      this.bets = [];
      return;
    }
    this.bets = res.rows ?? [];
    this.total = res.total ?? 0;
    this.totalPages = Math.max(1, res.totalPages ?? 1);
    this.page = Math.min(res.page ?? this.page, this.totalPages);
    this.pageInput = String(this.page);
  }

  onMyBetsToggle(): void {
    this.page = 1;
    void this.loadBets();
  }

  goPrev(): void {
    if (this.page <= 1) return;
    this.page -= 1;
    void this.loadBets();
  }

  goNext(): void {
    if (this.page >= this.totalPages) return;
    this.page += 1;
    void this.loadBets();
  }

  goToPageInput(): void {
    const n = parseInt(String(this.pageInput).trim(), 10);
    if (!Number.isFinite(n) || n < 1) return;
    const max = this.totalPages;
    this.page = Math.min(max, n);
    this.pageInput = String(this.page);
    void this.loadBets();
  }

  openProvablyFair(bet: PlayhouseBetRow): void {
    this.selectedBet = bet;
    this.verifyReport = null;
  }

  onFairModalHidden(): void {
    this.verifyReport = null;
    this.verifying = false;
  }

  get fairSnapshotForSelected(): FairSnapshot | null {
    const b = this.selectedBet;
    if (!b?.fairSnapshot || typeof b.fairSnapshot !== 'object') return null;
    const fs = b.fairSnapshot as Record<string, unknown>;
    const serverSeedHash = String(fs['serverSeedHash'] ?? '');
    const serverSeedReveal = String(fs['serverSeedReveal'] ?? '');
    const clientSeed = String(fs['clientSeed'] ?? '');
    const rollDigest = String(fs['rollDigest'] ?? '');
    const sub =
      typeof fs['subRoundIndex'] === 'number'
        ? fs['subRoundIndex']
        : typeof fs['nonce'] === 'number'
          ? fs['nonce']
          : 0;
    if (!serverSeedHash && !clientSeed) return null;
    return {
      serverSeedHash,
      serverSeedReveal,
      clientSeed,
      subRoundIndex: sub,
      rollDigest
    };
  }

  get finalFlowersForSelected(): { player: string[]; house: string[] } | null {
    const b = this.selectedBet;
    const fr = b?.finalRound;
    if (!fr?.player || !fr?.house || !Array.isArray(fr.player) || !Array.isArray(fr.house)) return null;
    if (fr.player.length !== 5 || fr.house.length !== 5) return null;
    return { player: fr.player.map(String), house: fr.house.map(String) };
  }

  async runVerify(): Promise<void> {
    const snap = this.fairSnapshotForSelected;
    const flowers = this.finalFlowersForSelected;
    if (!snap || !flowers || this.verifying) return;
    this.verifying = true;
    this.verifyReport = null;
    try {
      this.verifyReport = await verifyFlowerpokerRound({
        fairSnapshot: snap,
        player: flowers.player,
        house: flowers.house
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed.';
      this.verifyReport = { ok: false, summary: msg, comparisons: [] };
    } finally {
      this.verifying = false;
    }
  }

  canVerifySelected(): boolean {
    return !!this.fairSnapshotForSelected?.serverSeedReveal?.trim() && !!this.finalFlowersForSelected;
  }
}
