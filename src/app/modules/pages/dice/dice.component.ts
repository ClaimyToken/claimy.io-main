import { Component, OnDestroy } from '@angular/core';
import { ClaimyEdgeService } from 'src/app/services/claimy-edge.service';
import { PlayerRankingService } from 'src/app/services/player-ranking.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';
import type { VerificationResult } from '../flowerpoker/flowerpoker-provably-fair';
import { verifyDiceRound, type DiceFairSnapshot } from './dice-provably-fair';

const OUTCOME_SPACE = 1000;
const HOUSE_EDGE = 0.01;
const MAX_MULTIPLIER = 500;
const MIN_WIN_OUTCOMES = 20;
const MAX_WIN_OUTCOMES = 980;

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

@Component({
  selector: 'app-dice',
  templateUrl: './dice.component.html',
  styleUrls: ['./dice.component.scss']
})
export class DiceComponent implements OnDestroy {
  betAmountInput = '';
  mode: 'under' | 'over' = 'under';
  /** Integer string — bounds depend on mode (validated on roll). */
  targetInput = '5000';

  rolling = false;
  /** Shown after animation; `null` means no settled roll in this view yet. */
  displayRoll: number | null = null;
  fairSnapshot: Record<string, unknown> | null = null;

  message = 'Pick roll under or over, set your target, enter a stake, and roll.';
  resultTone: 'win' | 'loss' | null = null;
  winnerLabel: 'Player' | 'House' | null = null;
  lastPayout: number | null = null;

  toast: { type: 'success' | 'error'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  showDiceDetailsModal = false;
  verifyingRound = false;
  verificationReport: VerificationResult | null = null;

  constructor(
    private readonly walletAuth: WalletAuthService,
    private readonly claimyEdge: ClaimyEdgeService,
    private readonly playerRanking: PlayerRankingService
  ) {}

  ngOnDestroy(): void {
    if (this.toastClearId) clearTimeout(this.toastClearId);
  }

  get winCountPreview(): number | null {
    const t = this.parsedTarget;
    if (t == null) return null;
    if (this.mode === 'under') {
      if (t < MIN_WIN_OUTCOMES || t > MAX_WIN_OUTCOMES) return null;
      return t;
    }
    if (t < 19 || t > 979) return null;
    const wc = 999 - t;
    if (wc < MIN_WIN_OUTCOMES || wc > MAX_WIN_OUTCOMES) return null;
    return wc;
  }

  get multiplierPreview(): number | null {
    const wc = this.winCountPreview;
    if (wc == null) return null;
    const fair = OUTCOME_SPACE / wc;
    return round6(Math.min(MAX_MULTIPLIER, fair * (1 - HOUSE_EDGE)));
  }

  get winChancePreview(): string | null {
    const wc = this.winCountPreview;
    if (wc == null) return null;
    return `${((wc / OUTCOME_SPACE) * 100).toFixed(2)}%`;
  }

  private get parsedTarget(): number | null {
    const t = parseInt(String(this.targetInput).trim(), 10);
    if (!Number.isFinite(t) || !Number.isInteger(t)) return null;
    return t;
  }

  setMode(m: 'under' | 'over'): void {
    if (this.rolling) return;
    this.mode = m;
    if (m === 'under') {
      let t = this.parsedTarget ?? 500;
      if (t < MIN_WIN_OUTCOMES) t = MIN_WIN_OUTCOMES;
      if (t > MAX_WIN_OUTCOMES) t = MAX_WIN_OUTCOMES;
      this.targetInput = String(t);
    } else {
      let t = this.parsedTarget ?? 499;
      if (t < 19) t = 19;
      if (t > 979) t = 979;
      this.targetInput = String(t);
    }
    this.verificationReport = null;
  }

  openDiceDetailsModal(): void {
    this.showDiceDetailsModal = true;
  }

  closeDiceDetailsModal(): void {
    this.showDiceDetailsModal = false;
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

  private applyBalance(playable: number | undefined): void {
    if (typeof playable === 'number' && Number.isFinite(playable)) {
      this.walletAuth.claimyCreditsBalance = playable;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async roll(): Promise<void> {
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
    const target = this.parsedTarget;
    if (target == null) {
      this.flashToast('Enter a whole-number target.', 4000, 'error');
      return;
    }
    if (this.mode === 'under') {
      if (target < MIN_WIN_OUTCOMES || target > MAX_WIN_OUTCOMES) {
        this.flashToast(`Roll-under target must be ${MIN_WIN_OUTCOMES}–${MAX_WIN_OUTCOMES}.`, 5000, 'error');
        return;
      }
    } else {
      if (target < 19 || target > 979) {
        this.flashToast('Roll-over target must be 19–979.', 5000, 'error');
        return;
      }
      const wc = 999 - target;
      if (wc < MIN_WIN_OUTCOMES || wc > MAX_WIN_OUTCOMES) {
        this.flashToast('Invalid target for roll-over.', 5000, 'error');
        return;
      }
    }

    this.rolling = true;
    this.displayRoll = null;
    this.winnerLabel = null;
    this.resultTone = null;
    this.lastPayout = null;
    this.fairSnapshot = null;
    this.verificationReport = null;
    this.message = 'Rolling…';

    try {
      await this.delay(320);
      const res = await this.claimyEdge.rollDice({
        walletAddress: wallet,
        betAmount: amt,
        mode: this.mode,
        target
      });
      if (!res.ok) {
        this.message = res.error ?? 'Roll failed.';
        this.flashToast(res.error ?? 'Roll failed.', 5000, 'error');
        return;
      }
      this.applyBalance(res.playableBalance);
      const roll = res.roll;
      this.displayRoll = typeof roll === 'number' && Number.isFinite(roll) ? roll : null;
      this.fairSnapshot = res.fairSnapshot ?? null;
      this.winnerLabel = res.winner ?? null;
      this.resultTone = res.winner === 'Player' ? 'win' : 'loss';
      this.lastPayout = typeof res.payoutAmount === 'number' ? res.payoutAmount : null;

      if (res.winner === 'Player') {
        this.message = `Hit — roll ${this.displayRoll}. You win ${res.payoutAmount ?? 0} CLAIMY (includes stake × multiplier).`;
        this.flashToast('You win!', 3200, 'success');
      } else {
        this.message = `Miss — roll ${this.displayRoll}. House wins this round.`;
        this.flashToast('Round settled.', 2200, 'success');
      }
      await this.playerRanking.refresh();
    } finally {
      this.rolling = false;
    }
  }

  resultSummaryLine(): string {
    if (this.winnerLabel == null) return '\u00a0';
    if (this.winnerLabel === 'Player') return `Player wins — paid ${this.lastPayout ?? 0} CLAIMY`;
    return 'House wins';
  }

  async verifyProvablyFair(): Promise<void> {
    const fs = this.fairSnapshot as DiceFairSnapshot | null;
    if (!fs?.serverSeedReveal?.trim()) return;
    this.verifyingRound = true;
    this.verificationReport = null;
    try {
      this.verificationReport = await verifyDiceRound({ fairSnapshot: fs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed.';
      this.verificationReport = { ok: false, summary: msg, comparisons: [] };
    } finally {
      this.verifyingRound = false;
    }
  }
}
