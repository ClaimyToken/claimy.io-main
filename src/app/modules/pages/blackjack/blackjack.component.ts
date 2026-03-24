import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ClaimyEdgeService, BlackjackPublicGame } from 'src/app/services/claimy-edge.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

@Component({
  selector: 'app-blackjack',
  templateUrl: './blackjack.component.html',
  styleUrls: ['./blackjack.component.scss']
})
export class BlackjackComponent implements OnInit, OnDestroy {
  betAmountInput = '';
  placingBet = false;
  busy = false;

  activeGameId: string | null = null;
  game: BlackjackPublicGame | null = null;
  /** Set when the hand ends without a full `game` payload (instant peek / natural from start). */
  lastHandLabels: { player: string; house: string } | null = null;
  /** True after stand / bust / settle; keeps cards visible until the next bet. */
  handFinished = false;
  /** Shown after settlement (including instant naturals / dealer peek). */
  fairSnapshot: Record<string, unknown> | null = null;

  message = 'Enter a bet in CLAIMY credits and start a hand.';
  winnerName: 'Player' | 'House' | 'Tie' | null = null;
  resultTone: 'win' | 'loss' | 'tie' | null = null;

  resumingSession = false;
  toast: { type: 'success' | 'error'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  showBjDetailsModal = false;

  constructor(
    private readonly walletAuth: WalletAuthService,
    private readonly claimyEdge: ClaimyEdgeService
  ) {}

  get gameSessionActive(): boolean {
    return !!this.activeGameId && !!this.game && !this.handFinished;
  }

  ngOnInit(): void {
    void this.tryResumeSessionWithRetries();
  }

  ngOnDestroy(): void {
    if (this.toastClearId) clearTimeout(this.toastClearId);
  }

  private async tryResumeSessionWithRetries(maxWaitMs = 6000): Promise<void> {
    const stepMs = 200;
    let waited = 0;
    while (waited < maxWaitMs) {
      const wallet = this.resolveWallet();
      if (wallet) {
        await this.tryResumeSession();
        return;
      }
      await this.delay(stepMs);
      waited += stepMs;
    }
  }

  private async tryResumeSession(): Promise<void> {
    const wallet = this.resolveWallet();
    if (!wallet) return;
    this.resumingSession = true;
    try {
      const res = await this.claimyEdge.resumeBlackjackSession(wallet);
      if (!res.ok) return;
      if (res.staleRefunded) {
        if (typeof res.playableBalance === 'number' && Number.isFinite(res.playableBalance)) {
          this.walletAuth.claimyCreditsBalance = res.playableBalance;
        }
        this.flashToast('A broken session was refunded to your playable balance.', 5200, 'success');
        return;
      }
      if (!res.active || !res.gameId || !res.game) return;
      if (typeof res.playableBalance === 'number' && Number.isFinite(res.playableBalance)) {
        this.walletAuth.claimyCreditsBalance = res.playableBalance;
      }
      this.activeGameId = res.gameId;
      this.game = res.game;
      this.handFinished = false;
      this.lastHandLabels = null;
      this.fairSnapshot = res.game.fairSnapshot;
      this.clearResult();
      this.message = 'Resumed your in-progress hand.';
      this.flashToast('Resumed your in-progress hand.', 3600, 'success');
    } finally {
      this.resumingSession = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private resolveWallet(): string | null {
    return this.walletAuth.walletAddress?.trim() || null;
  }

  private flashToast(message: string, ms: number, type: 'success' | 'error'): void {
    if (this.toastClearId) clearTimeout(this.toastClearId);
    this.toast = { type, message };
    this.toastClearId = setTimeout(() => {
      this.toast = null;
      this.toastClearId = null;
    }, ms);
  }

  private clearResult(): void {
    this.winnerName = null;
    this.resultTone = null;
  }

  private applyBalance(playable: number | undefined): void {
    if (typeof playable === 'number' && Number.isFinite(playable)) {
      this.walletAuth.claimyCreditsBalance = playable;
    }
  }

  openBjDetailsModal(): void {
    this.showBjDetailsModal = true;
    this.lockBodyScroll();
  }

  closeBjDetailsModal(): void {
    this.showBjDetailsModal = false;
    this.unlockBodyScroll();
  }

  private lockBodyScroll(): void {
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter > 0) {
      document.body.style.paddingRight = `${gutter}px`;
    }
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseDetails(): void {
    if (this.showBjDetailsModal) {
      this.closeBjDetailsModal();
    }
  }

  formatCard(code: string): string {
    if (!code || code === '??') return code === '??' ? '??' : '—';
    const suit = code[0];
    const rank = code.slice(1);
    const sym: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
    return `${sym[suit] ?? suit}${rank}`;
  }

  async placeBetAndStart(): Promise<void> {
    const wallet = this.resolveWallet();
    if (!wallet) {
      this.flashToast('Connect your wallet first.', 4000, 'error');
      return;
    }
    const amt = this.betAmountInput.trim();
    if (!/^\d+(\.\d+)?$/.test(amt)) {
      this.flashToast('Enter a positive bet amount.', 4000, 'error');
      return;
    }
    this.placingBet = true;
    this.clearResult();
    this.game = null;
    this.lastHandLabels = null;
    this.handFinished = false;
    try {
      const res = await this.claimyEdge.startBlackjackBet({
        walletAddress: wallet,
        betAmount: amt
      });
      if (!res.ok) {
        this.flashToast(res.error ?? 'Could not start hand.', 5000, 'error');
        return;
      }
      this.applyBalance(res.playableBalance);

      if (res.settled) {
        this.activeGameId = null;
        this.game = null;
        this.handFinished = true;
        this.lastHandLabels = {
          player: res.playerHand ?? '—',
          house: res.houseHand ?? '—'
        };
        this.winnerName = res.winner ?? null;
        this.resultTone =
          res.winner === 'Player' ? 'win' : res.winner === 'Tie' ? 'tie' : 'loss';
        this.message =
          res.winner === 'Player'
            ? `You win — payout ${res.payoutAmount ?? 0} CLAIMY.`
            : res.winner === 'Tie'
              ? `Push — ${res.payoutAmount ?? 0} CLAIMY returned.`
              : 'House wins.';
        this.fairSnapshot = (res.fairSnapshot as Record<string, unknown>) ?? null;
        return;
      }

      this.activeGameId = res.gameId ?? null;
      this.game = res.game ?? null;
      this.fairSnapshot = this.game?.fairSnapshot ?? null;
      this.message = 'Your move — hit, stand, double, or resolve insurance if offered.';
    } finally {
      this.placingBet = false;
    }
  }

  async sendMove(move: 'insurance_yes' | 'insurance_no' | 'hit' | 'stand' | 'double'): Promise<void> {
    const wallet = this.resolveWallet();
    if (!wallet || !this.activeGameId) return;
    this.busy = true;
    try {
      const res = await this.claimyEdge.blackjackPlayerAction({
        walletAddress: wallet,
        gameId: this.activeGameId,
        move
      });
      if (!res.ok) {
        this.flashToast(res.error ?? 'Action failed.', 5000, 'error');
        return;
      }
      this.applyBalance(res.playableBalance);
      if (res.game) {
        this.game = res.game;
        if (res.game.fairSnapshot) {
          this.fairSnapshot = res.game.fairSnapshot;
        }
      }
      if (res.settled) {
        this.winnerName = res.winner ?? null;
        this.resultTone =
          res.winner === 'Player' ? 'win' : res.winner === 'Tie' ? 'tie' : 'loss';
        this.message =
          res.winner === 'Player'
            ? `You win — payout ${res.payoutAmount ?? 0} CLAIMY.`
            : res.winner === 'Tie'
              ? `Push — ${res.payoutAmount ?? 0} CLAIMY returned.`
              : 'House wins.';
        if (res.fairSnapshot && typeof res.fairSnapshot === 'object') {
          this.fairSnapshot = res.fairSnapshot as Record<string, unknown>;
        }
        this.handFinished = true;
        this.activeGameId = null;
        this.lastHandLabels = null;
        if (res.game) {
          this.game = res.game;
        }
      } else {
        this.message = 'Continue your hand or stand.';
      }
    } finally {
      this.busy = false;
    }
  }

  insuranceYes(): void {
    void this.sendMove('insurance_yes');
  }

  insuranceNo(): void {
    void this.sendMove('insurance_no');
  }

  hit(): void {
    void this.sendMove('hit');
  }

  stand(): void {
    void this.sendMove('stand');
  }

  double(): void {
    void this.sendMove('double');
  }
}
