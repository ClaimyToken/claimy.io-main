import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ClaimyCreditsService } from '../../../services/claimy-credits.service';
import { ConfigService } from '../../../services/config.service';
import { WalletAuthService } from '../../../services/wallet-auth.service';

declare global {
  interface Window {
    phantom?: any;
  }
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnDestroy {
  private readonly walletLoginEndpoint = 'wallet-login';

  phantomWalletAddress = '';
  connecting = false;
  verifying = false;
  connectError: string | null = null;

  toast: { type: 'error' | 'success'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly router: Router,
    private readonly walletAuth: WalletAuthService,
    private readonly claimyCredits: ClaimyCreditsService,
    private readonly config: ConfigService
  ) {}

  private showToast(message: string, type: 'error' | 'success', durationMs = 5000) {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = { message, type };
    if (durationMs > 0) {
      this.toastClearId = setTimeout(() => this.dismissToast(), durationMs);
    }
  }

  dismissToast() {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = null;
  }

  ngOnDestroy() {
    this.dismissToast();
  }

  async connectPhantom() {
    this.connectError = null;
    const provider = window.phantom?.solana;
    if (!provider) {
      this.connectError = 'Phantom wallet not found. Please install Phantom and try again.';
      return;
    }

    this.connecting = true;
    try {
      const res = await provider.connect();
      this.phantomWalletAddress = res?.publicKey?.toString?.() ?? '';
      if (!this.phantomWalletAddress) {
        this.connectError = 'Could not read your Phantom wallet address.';
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to connect Phantom wallet.';
      this.connectError = msg;
    } finally {
      this.connecting = false;
    }
  }

  verifyWalletLogin() {
    const addr = this.phantomWalletAddress?.trim();
    if (!addr) {
      this.showToast('Connect Phantom first.', 'error');
      return;
    }

    this.verifying = true;
    this.dismissToast();

    const url = `${this.config.supabaseUrl}/functions/v1/${this.walletLoginEndpoint}`;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: addr })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { error?: string }).error ?? 'Could not verify wallet.');
        }
        return data as {
          found?: boolean;
          username?: string;
          createdAt?: string | null;
          depositAddress?: string | null;
          referralCode?: string | null;
          referralCount?: number | null;
          gamesClientSeed?: string | null;
        };
      })
      .then((data) => {
        if (data.found === true && data.username) {
          this.walletAuth.loginWithWallet(
            data.username,
            addr,
            data.createdAt,
            data.depositAddress,
            data.referralCode ?? null,
            data.referralCount ?? null,
            data.gamesClientSeed ?? null
          );
          void this.claimyCredits.refresh();
          this.walletAuth.setPendingWelcomeToast(`Signed in as ${data.username}.`);
          void this.router.navigate(['/home']);
        } else {
          this.showToast(
            'No Claimy account was found for this wallet. Register first.',
            'error'
          );
        }
      })
      .catch((e: Error) => {
        this.showToast(e.message ?? 'Something went wrong.', 'error');
      })
      .finally(() => {
        this.verifying = false;
      });
  }
}
