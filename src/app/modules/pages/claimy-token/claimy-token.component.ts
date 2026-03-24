import { Component } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-claimy-token',
  templateUrl: './claimy-token.component.html',
  styleUrls: ['./claimy-token.component.scss']
})
export class ClaimyTokenComponent {
  readonly totalSupply = 1_000_000_000;
  readonly publicSupplyAfterDev = 950_000_000;
  readonly devBuyPercent = 5;

  /** Remaining float after dev allocation (shown in pie + legend). */
  get publicFloatPercent(): number {
    return 100 - this.devBuyPercent;
  }

  get devAllocationTokens(): number {
    return Math.round((this.totalSupply * this.devBuyPercent) / 100);
  }

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
