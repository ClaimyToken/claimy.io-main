import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from 'src/app/services/config.service';
import { LoginModalService } from 'src/app/services/login-modal.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

declare global {
  interface Window {
    phantom?: any;
  }
}

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnDestroy {
  constructor(
    private readonly router: Router,
    private readonly walletAuth: WalletAuthService,
    private readonly config: ConfigService,
    private readonly loginModal: LoginModalService
  ) {}

  private readonly endpoints = {
    checkUsername: 'check-username',
    registerPhantom: 'register-phantom'
  };

  username = '';
  /** Optional — friend referral code (server matches existing user’s `referral_code`). */
  referralCodeInput = '';
  /** null = not checked yet, true = free, false = taken */
  usernameAvailable: boolean | null = null;
  checkingUsername = false;

  phantomWalletAddress = '';
  phantomMessage = '';
  phantomSignatureBase64 = '';
  /** True while connect+sign or a sign retry is in flight. */
  walletStepBusy = false;

  submittingRegistration = false;
  registrationComplete = false;
  showRegistrationSuccessModal = false;
  copiedWallet = false;
  copiedSignature = false;

  toast: { type: 'error' | 'info' | 'success'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  private getNormalizedUsername(): string {
    return this.username.trim().toLowerCase();
  }

  /** Map raw server / DB strings to readable copy (fallback if Edge Function is older). */
  private humanizeError(raw: string): string {
    const m = raw.toLowerCase();
    if (m.includes('claimy_users_wallet_address_key')) {
      return 'This wallet is already linked to an account.';
    }
    if (m.includes('claimy_users_username_key')) {
      return 'That username is already taken.';
    }
    if (m.includes('claimy_registration_nonces_pkey') || m.includes('duplicate key')) {
      return 'This signature was already used. Please sign a new message.';
    }
    if (m.includes('violates unique constraint')) {
      return 'That username or wallet is already registered.';
    }
    return raw;
  }

  showToast(message: string, type: 'error' | 'info' | 'success' = 'error', durationMs = 6000) {
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

  /** Call when user edits username after a successful check */
  onUsernameChange() {
    this.usernameAvailable = null;
    this.phantomSignatureBase64 = '';
    this.phantomMessage = '';
    this.registrationComplete = false;
    this.showRegistrationSuccessModal = false;
  }

  checkUsernameAvailability() {
    const u = this.getNormalizedUsername();
    if (u.length < 3 || u.length > 24) {
      this.showToast('Username must be between 3 and 24 characters.', 'error');
      this.usernameAvailable = null;
      return;
    }

    this.checkingUsername = true;
    this.dismissToast();
    this.usernameAvailable = null;

    const url = `${this.config.supabaseUrl}/functions/v1/${this.endpoints.checkUsername}`;

    const body: { username: string; walletAddress?: string } = { username: u };
    const w = this.phantomWalletAddress?.trim();
    if (w) {
      body.walletAddress = w;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error ?? 'Could not check username.'
          );
        }
        return data as { available?: boolean };
      })
      .then((data) => {
        const available = data.available === true;
        this.usernameAvailable = available;
        if (available) {
          this.dismissToast();
        } else {
          this.showToast('That username is already taken. Try another.', 'error');
        }
      })
      .catch((e: Error) => {
        this.usernameAvailable = null;
        this.showToast(this.humanizeError(e.message ?? 'Could not check username.'), 'error');
      })
      .finally(() => {
        this.checkingUsername = false;
      });
  }

  /**
   * One click: connect Phantom, then immediately request the registration signature.
   * If the user rejects the signature, `phantomWalletAddress` may still be set — use `signPhantomMessage()` to retry.
   */
  async connectAndSignPhantom() {
    if (this.usernameAvailable !== true) {
      this.showToast('Confirm your username is available first.', 'error');
      return;
    }

    this.dismissToast();

    const provider = window.phantom?.solana;
    if (!provider) {
      this.showToast('Phantom wallet not found. Please install Phantom and try again.', 'error');
      return;
    }

    this.walletStepBusy = true;
    try {
      const res = await provider.connect();
      this.phantomWalletAddress = res?.publicKey?.toString?.() ?? '';
      this.phantomSignatureBase64 = '';
      this.phantomMessage = '';

      if (!this.phantomWalletAddress) {
        this.showToast('Could not read your Phantom wallet address.', 'error');
        return;
      }

      await this.runSignWithProvider(provider);
      this.dismissToast();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to connect or sign.';
      this.showToast(msg, 'error');
    } finally {
      this.walletStepBusy = false;
    }
  }

  /** Primary button on step 2: connect+sign, or retry sign if already connected. */
  walletStepPrimaryAction() {
    if (this.phantomSignatureBase64 || this.walletStepBusy) return;
    if (this.phantomWalletAddress) {
      void this.signPhantomMessage();
      return;
    }
    void this.connectAndSignPhantom();
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  private buildPhantomRegistrationMessage(): string {
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = this.toBase64(nonceBytes);

    return [
      'CLAIMY registration',
      `username: ${this.getNormalizedUsername() || '(missing username)'}`,
      `wallet: ${this.phantomWalletAddress || '(wallet not connected yet)'}`,
      `nonce: ${nonce}`,
      `timestamp: ${new Date().toISOString()}`
    ].join('\n');
  }

  /** Sign after connect, or retry if the user rejected the first sign prompt. */
  async signPhantomMessage() {
    if (this.usernameAvailable !== true) {
      this.showToast('Confirm your username is available first.', 'error');
      return;
    }

    const provider = window.phantom?.solana;
    if (!provider) {
      this.showToast('Phantom wallet not found.', 'error');
      return;
    }

    if (!this.phantomWalletAddress) {
      this.showToast('Use “Connect & sign” first.', 'error');
      return;
    }

    this.dismissToast();
    this.walletStepBusy = true;
    try {
      await this.runSignWithProvider(provider);
      this.dismissToast();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to sign message.';
      this.showToast(msg, 'error');
    } finally {
      this.walletStepBusy = false;
    }
  }

  private async runSignWithProvider(provider: {
    signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature?: Uint8Array } | Uint8Array>;
  }): Promise<void> {
    this.phantomMessage = this.buildPhantomRegistrationMessage();
    const encoded = new TextEncoder().encode(this.phantomMessage);

    const signed = await provider.signMessage(encoded, 'utf8');
    const signatureBytes: Uint8Array =
      signed && typeof signed === 'object' && 'signature' in signed && signed.signature instanceof Uint8Array
        ? signed.signature
        : signed instanceof Uint8Array
          ? signed
          : new Uint8Array();

    if (!signatureBytes.length) {
      throw new Error('Could not sign message.');
    }

    this.phantomSignatureBase64 = this.toBase64(signatureBytes);
  }

  completeRegistration() {
    if (this.usernameAvailable !== true) {
      this.showToast('Confirm your username is available first.', 'error');
      return;
    }
    if (!this.phantomWalletAddress) {
      this.showToast('Connect Phantom first.', 'error');
      return;
    }
    if (!this.phantomSignatureBase64) {
      this.showToast('Sign the message first.', 'error');
      return;
    }

    this.submittingRegistration = true;
    this.dismissToast();

    const url = `${this.config.supabaseUrl}/functions/v1/${this.endpoints.registerPhantom}`;

    const refSanitized = this.referralCodeInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const bodyPayload: Record<string, unknown> = {
      username: this.getNormalizedUsername(),
      walletAddress: this.phantomWalletAddress,
      message: this.phantomMessage,
      signatureBase64: this.phantomSignatureBase64
    };
    if (refSanitized.length >= 4) {
      bodyPayload['referralCode'] = refSanitized;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error ?? 'Registration failed.'
          );
        }
        return data as { ok?: boolean; createdAt?: string; depositAddress?: string };
      })
      .then((data) => {
        this.walletAuth.rememberRegistrationCreatedAt(
          this.phantomWalletAddress.trim(),
          data.createdAt
        );
        this.walletAuth.rememberRegistrationDepositAddress(
          this.phantomWalletAddress.trim(),
          data.depositAddress
        );
        this.registrationComplete = true;
        this.showRegistrationSuccessModal = true;
      })
      .catch((e: Error) => {
        this.showToast(this.humanizeError(e.message ?? 'Registration failed.'), 'error');
      })
      .finally(() => {
        this.submittingRegistration = false;
      });
  }

  closeRegistrationSuccessModal() {
    this.showRegistrationSuccessModal = false;
    if (this.registrationComplete) {
      void this.router.navigate(['/home']);
      this.loginModal.open();
    }
  }

  async copyToClipboard(value: string, field: 'wallet' | 'signature') {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (field === 'wallet') {
        this.copiedWallet = true;
        setTimeout(() => {
          this.copiedWallet = false;
        }, 1400);
      } else {
        this.copiedSignature = true;
        setTimeout(() => {
          this.copiedSignature = false;
        }, 1400);
      }
    } catch {
      this.showToast('Could not copy to clipboard.', 'error');
    }
  }
}
