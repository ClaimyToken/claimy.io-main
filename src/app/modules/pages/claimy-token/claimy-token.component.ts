import { Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-claimy-token',
  templateUrl: './claimy-token.component.html',
  styleUrls: ['./claimy-token.component.scss']
})
export class ClaimyTokenComponent {
  readonly totalSupply = 1_000_000_000;

  /**
   * Creator-side purchase (~40 SOL, ~60% of total supply) held on the creator wallet before split:
   * Streamflow lock + Playhouse bankroll.
   */
  readonly creatorAllocationTokens = 600_000_000;

  /** Locked on Streamflow for 2 months (55% of total supply). */
  readonly streamflowLockedTokens = 550_000_000;

  /** Dedicated to Playhouse betting mechanics / house bankroll (5% of total supply). */
  readonly casinoBankrollTokens = 50_000_000;

  /** Broader circulating supply outside locked + bankroll (e.g. pump.fun float). */
  readonly remainderTokens = 400_000_000;

  /** Pie ring: fractions of 1B that sum to 1. */
  readonly lockedFraction = 0.55;
  readonly casinoFraction = 0.05;
  readonly remainderFraction = 0.4;

  toast: { type: 'success'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  constructor(public readonly config: ConfigService) {}

  get hasMint(): boolean {
    return !!this.config.claimyTokenMint;
  }

  async copyMint(): Promise<void> {
    const m = this.config.claimyTokenMint;
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m);
      this.flashToast('Token address copied.');
    } catch {
      this.flashToast('Could not copy.');
    }
  }

  dismissToast(): void {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = null;
  }

  private flashToast(message: string): void {
    this.dismissToast();
    this.toast = { type: 'success', message };
    this.toastClearId = setTimeout(() => this.dismissToast(), 4200);
  }
}
