import { Component, OnDestroy, OnInit } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  toast: { type: 'success'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly walletAuth: WalletAuthService,
    readonly config: ConfigService
  ) {}

  ngOnInit() {
    const msg = this.walletAuth.consumePendingWelcomeToast();
    if (msg) {
      this.flashToast(msg);
    }
  }

  ngOnDestroy() {
    this.dismissToast();
  }

  async copyTokenAddress(): Promise<void> {
    const m = this.config.claimyTokenMint;
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m);
      this.flashToast('Token address copied.');
    } catch {
      this.flashToast('Could not copy.');
    }
  }

  dismissToast() {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = null;
  }

  private flashToast(message: string) {
    this.dismissToast();
    this.toast = { type: 'success', message };
    this.toastClearId = setTimeout(() => this.dismissToast(), 5200);
  }
}
