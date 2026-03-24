import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ClaimyEdgeService, BlackjackPublicGame } from 'src/app/services/claimy-edge.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';
import type { VerificationResult } from '../flowerpoker/flowerpoker-provably-fair';
import { verifyBlackjackRound, type BlackjackFairSnapshot } from './blackjack-provably-fair';

const CARD_DEAL_MS = 1000;

function buildRevealQueue(
  prev: { player: string[]; dealer: string[] },
  next: BlackjackPublicGame
): { side: 'p' | 'd'; idx: number; code: string }[] {
  const q: { side: 'p' | 'd'; idx: number; code: string }[] = [];
  const pc = prev.player;
  const dc = prev.dealer;
  const np = next.playerCards;
  const nd = next.dealerCards;

  if (pc.length === 0 && dc.length === 0 && np.length >= 2 && nd.length >= 2) {
    q.push({ side: 'p', idx: 0, code: np[0]! });
    q.push({ side: 'd', idx: 0, code: nd[0]! });
    q.push({ side: 'p', idx: 1, code: np[1]! });
    // Dealer hole card may be hidden as ?? initially; do not animate a fake "draw" for that placeholder.
    if (nd[1] !== '??') q.push({ side: 'd', idx: 1, code: nd[1]! });
    for (let i = 2; i < np.length; i++) q.push({ side: 'p', idx: i, code: np[i]! });
    for (let i = 2; i < nd.length; i++) q.push({ side: 'd', idx: i, code: nd[i]! });
    return q;
  }

  for (let i = 0; i < np.length; i++) {
    if (i >= pc.length || pc[i] !== np[i]) {
      q.push({ side: 'p', idx: i, code: np[i]! });
    }
  }
  for (let i = 0; i < nd.length; i++) {
    if (i >= dc.length || dc[i] !== nd[i]) {
      q.push({ side: 'd', idx: i, code: nd[i]! });
    }
  }
  return q;
}

function rankOf(card: string): string {
  if (!card || card === '??') return '?';
  return card.slice(1);
}

function scoreVisibleHand(cards: string[]): string {
  const usable = cards.filter((c) => c && c !== '??');
  if (usable.length === 0) return '—';
  let total = 0;
  let aces = 0;
  for (const c of usable) {
    const r = rankOf(c);
    if (r === 'A') {
      aces++;
      total += 11;
    } else if (r === 'J' || r === 'Q' || r === 'K' || r === '10') {
      total += 10;
    } else {
      total += parseInt(r, 10) || 0;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  if (total > 21) return 'Bust';
  return String(total);
}

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
  /** Animated deal view (may lag `game` while dealing). */
  displayPlayerCards: string[] = [];
  displayDealerCards: string[] = [];
  dealingAnimating = false;
  revealingSlot: { side: 'p' | 'd'; idx: number } | null = null;

  lastHandLabels: { player: string; house: string } | null = null;
  handFinished = false;
  fairSnapshot: Record<string, unknown> | null = null;

  message = 'Enter a bet in CLAIMY credits and start a hand.';
  winnerName: 'Player' | 'House' | 'Tie' | null = null;
  resultTone: 'win' | 'loss' | 'tie' | null = null;

  resumingSession = false;
  toast: { type: 'success' | 'error'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  showBjDetailsModal = false;

  verifyingRound = false;
  verificationReport: VerificationResult | null = null;

  constructor(
    private readonly walletAuth: WalletAuthService,
    private readonly claimyEdge: ClaimyEdgeService
  ) {}

  get gameSessionActive(): boolean {
    return (
      !!this.activeGameId &&
      !!this.game &&
      !this.handFinished &&
      !this.dealingAnimating
    );
  }

  get playerTotalShown(): string {
    if (this.showTotalsFromGame) {
      return this.game?.playerTotal ?? '—';
    }
    return scoreVisibleHand(this.displayPlayerCards);
  }

  get dealerTotalShown(): string {
    if (this.showTotalsFromGame) {
      return this.game?.dealerTotal ?? '—';
    }
    return scoreVisibleHand(this.displayDealerCards);
  }

  /** After animation completes, show server totals; during deal show partial from visible cards. */
  private get showTotalsFromGame(): boolean {
    return !this.dealingAnimating && !!this.game;
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
      this.displayPlayerCards = [];
      this.displayDealerCards = [];
      this.game = res.game;
      this.handFinished = false;
      this.lastHandLabels = null;
      this.fairSnapshot = res.game.fairSnapshot;
      this.clearResult();
      this.message = 'Resumed your in-progress hand.';
      this.flashToast('Resumed your in-progress hand.', 3600, 'success');
      this.verificationReport = null;
      await this.runDealAnimation(null, res.game);
    } finally {
      this.resumingSession = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private resolveWallet(): string | null {
    let w = this.walletAuth.walletAddress?.trim() ?? '';
    if (!w) w = this.walletAuth.getPersistedSessionWallet()?.trim() ?? '';
    if (!w) {
      try {
        const win = window as Window & { phantom?: { solana?: { publicKey?: { toString?: () => string } } } };
        w = win.phantom?.solana?.publicKey?.toString?.()?.trim?.() ?? '';
      } catch {
        /* ignore */
      }
    }
    return w || null;
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

  isRevealLoading(side: 'p' | 'd', idx: number): boolean {
    return (
      this.dealingAnimating &&
      this.revealingSlot !== null &&
      this.revealingSlot.side === side &&
      this.revealingSlot.idx === idx
    );
  }

  slotHasCard(side: 'p' | 'd', idx: number): boolean {
    const arr = side === 'p' ? this.displayPlayerCards : this.displayDealerCards;
    return !!arr[idx];
  }

  get dealerSlotIndices(): number[] {
    const loadingCount = this.revealingSlot?.side === 'd' ? this.revealingSlot.idx + 1 : 0;
    const count = Math.max(this.displayDealerCards.length, loadingCount);
    return Array.from({ length: count }, (_, i) => i);
  }

  get playerSlotIndices(): number[] {
    const loadingCount = this.revealingSlot?.side === 'p' ? this.revealingSlot.idx + 1 : 0;
    const count = Math.max(this.displayPlayerCards.length, loadingCount);
    return Array.from({ length: count }, (_, i) => i);
  }

  get currentRoundLog(): { t: string; detail?: string }[] {
    return this.game?.roundLog ?? [];
  }

  get canInsuranceAction(): boolean {
    return this.gameSessionActive && !!this.game?.canInsurance;
  }

  get canHitAction(): boolean {
    return this.gameSessionActive && !!this.game?.canHit;
  }

  get canStandAction(): boolean {
    return this.gameSessionActive && !!this.game?.canStand;
  }

  get canDoubleAction(): boolean {
    return this.gameSessionActive && !!this.game?.canDouble;
  }

  private async runDealAnimation(
    beforeGame: BlackjackPublicGame | null,
    after: BlackjackPublicGame
  ): Promise<void> {
    const prev = beforeGame
      ? { player: [...beforeGame.playerCards], dealer: [...beforeGame.dealerCards] }
      : { player: [], dealer: [] };
    const queue = buildRevealQueue(prev, after);
    if (queue.length === 0) {
      this.displayPlayerCards = [...after.playerCards];
      this.displayDealerCards = [...after.dealerCards];
      return;
    }

    this.dealingAnimating = true;
    this.revealingSlot = null;
    if (prev.player.length === 0 && prev.dealer.length === 0) {
      this.displayPlayerCards = [];
      this.displayDealerCards = [];
    } else {
      this.displayPlayerCards = [...prev.player];
      this.displayDealerCards = [...prev.dealer];
    }

    for (const step of queue) {
      this.revealingSlot = { side: step.side, idx: step.idx };
      await this.delay(CARD_DEAL_MS);
      if (step.side === 'p') {
        this.displayPlayerCards[step.idx] = step.code;
      } else {
        this.displayDealerCards[step.idx] = step.code;
      }
      this.revealingSlot = null;
    }
    this.displayPlayerCards = [...after.playerCards];
    this.displayDealerCards = [...after.dealerCards];
    this.dealingAnimating = false;
    this.revealingSlot = null;
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
    this.verificationReport = null;
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
        this.displayPlayerCards = [];
        this.displayDealerCards = [];
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
      this.displayPlayerCards = [];
      this.displayDealerCards = [];
      this.game = res.game ?? null;
      this.fairSnapshot = this.game?.fairSnapshot ?? null;
      if (this.game) {
        await this.runDealAnimation(null, this.game);
      }
      this.message = 'Your move — hit, stand, double, or resolve insurance if offered.';
    } finally {
      this.placingBet = false;
    }
  }

  async sendMove(move: 'insurance_yes' | 'insurance_no' | 'hit' | 'stand' | 'double'): Promise<void> {
    const wallet = this.resolveWallet();
    if (!wallet || !this.activeGameId) return;
    this.busy = true;
    const beforeGame = this.game;
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
        this.message = 'Settling hand…';
        if (res.fairSnapshot && typeof res.fairSnapshot === 'object') {
          this.fairSnapshot = res.fairSnapshot as Record<string, unknown>;
        }
        if (res.game) {
          await this.runDealAnimation(beforeGame, res.game);
        }
        this.winnerName = res.winner ?? null;
        this.resultTone =
          res.winner === 'Player' ? 'win' : res.winner === 'Tie' ? 'tie' : 'loss';
        this.message =
          res.winner === 'Player'
            ? `You win — payout ${res.payoutAmount ?? 0} CLAIMY.`
            : res.winner === 'Tie'
              ? `Push — ${res.payoutAmount ?? 0} CLAIMY returned.`
              : 'House wins.';
        this.handFinished = true;
        this.activeGameId = null;
        this.lastHandLabels = null;
        this.verificationReport = null;
      } else if (res.game) {
        await this.runDealAnimation(beforeGame, res.game);
        this.message = 'Continue your hand or stand.';
      }
    } finally {
      this.busy = false;
    }
  }

  async verifyProvablyFair(): Promise<void> {
    const fs = this.fairSnapshot as BlackjackFairSnapshot | null;
    if (!fs?.serverSeedReveal?.trim()) return;
    this.verifyingRound = true;
    this.verificationReport = null;
    try {
      this.verificationReport = await verifyBlackjackRound({
        fairSnapshot: fs,
        playerCards: this.game?.playerCards,
        dealerCards: this.game?.dealerCards
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed.';
      this.verificationReport = { ok: false, summary: msg, comparisons: [] };
    } finally {
      this.verifyingRound = false;
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
