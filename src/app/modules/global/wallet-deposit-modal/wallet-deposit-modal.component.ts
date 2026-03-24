import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { ClaimyCreditsService } from 'src/app/services/claimy-credits.service';
import { ClaimyCreditLedgerRow, ClaimyEdgeService } from 'src/app/services/claimy-edge.service';
import { ConfigService } from 'src/app/services/config.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

/** Phantom injected on `window` (see register.component global). */
type PhantomSolanaProvider = {
  connect: () => Promise<unknown>;
  signMessage: (msg: Uint8Array, enc: string) => Promise<unknown>;
};

@Component({
  selector: 'app-wallet-deposit-modal',
  templateUrl: './wallet-deposit-modal.component.html',
  styleUrls: ['./wallet-deposit-modal.component.scss']
})
export class WalletDepositModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('walletModal') walletModalRef?: ElementRef<HTMLElement>;

  loadingBalance = false;
  copiedDeposit = false;
  copiedMint = false;
  private copyDepositResetId: ReturnType<typeof setTimeout> | null = null;
  private copyMintResetId: ReturnType<typeof setTimeout> | null = null;

  /** From Supabase `account-linked-wallet` after user taps Verify — must match session Phantom wallet. */
  serverVerifiedRegistrationWallet: string | null = null;
  /** Green “Verified with Claimy” only after an explicit successful Verify click. */
  linkedWalletUserVerified = false;

  /** Shown inline under the Phantom address after Verify. */
  readonly verifyWithClaimySuccessMessage =
    'Verified — matches your registered Phantom wallet.';
  linkedWalletVerifiedAt: Date | null = null;
  verifyingLinkedWallet = false;
  linkedWalletError: string | null = null;

  /** Expandable wallet sections (reduce modal scroll). */
  depositSectionOpen = false;
  withdrawSectionOpen = false;
  historySectionOpen = false;

  ledgerEntries: ClaimyCreditLedgerRow[] = [];
  loadingLedger = false;
  ledgerDirection: 'all' | 'incoming' | 'outgoing' = 'all';

  withdrawAmount = '';
  withdrawBusy = false;
  /** Fixed-position toast (does not resize the modal body). */
  toast: { type: 'error' | 'success' | 'info'; text: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  private onModalShown = () => {
    this.dismissToast();
    void this.refreshBalance();
    this.linkedWalletError = null;
    this.serverVerifiedRegistrationWallet = null;
    this.linkedWalletUserVerified = false;
    this.linkedWalletVerifiedAt = null;
    /** Same check as “tap to verify”, but automatic — server is source of truth for registered wallet. */
    void this.refreshLinkedWallet(false);
  };

  constructor(
    public walletAuth: WalletAuthService,
    public config: ConfigService,
    private readonly credits: ClaimyCreditsService,
    private readonly claimyEdge: ClaimyEdgeService
  ) {}

  get hasMintConfigured(): boolean {
    return !!this.config.claimySplMintAddress?.trim();
  }

  /** Credits number for display (0 when none / unknown with mint configured). */
  get creditsAmount(): number {
    if (!this.hasMintConfigured) return 0;
    const n = this.walletAuth.claimyCreditsBalance;
    return n != null && Number.isFinite(n) ? n : 0;
  }

  /** Phantom wallet withdrawals are sent to (verified from Supabase when possible). */
  get displayWithdrawDestination(): string {
    return (
      this.serverVerifiedRegistrationWallet?.trim() ||
      this.walletAuth.walletAddress?.trim() ||
      ''
    );
  }

  /** True only after Supabase verify returned a wallet that matches the logged-in Phantom. */
  get linkedWalletMatchesSession(): boolean {
    const s = this.walletAuth.walletAddress?.trim();
    const v = this.serverVerifiedRegistrationWallet?.trim();
    if (!s || !v) return false;
    return s === v;
  }

  numDelta(v: number | string): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
  }

  entryTypeLabel(t: string): string {
    const m: Record<string, string> = {
      deposit: 'Deposit',
      withdraw: 'Withdraw',
      chain_sync: 'Chain sync',
      game_win: 'Game',
      adjustment: 'Adjustment'
    };
    return m[t] ?? t;
  }

  /** Solscan link when `ref` looks like a transaction signature. */
  solscanTxUrl(ref: string | null | undefined): string | null {
    const r = ref?.trim();
    if (!r || r.length < 80) {
      return null;
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(r)) {
      return null;
    }
    const isDev = (this.config.solanaRpcUrl ?? '').toLowerCase().includes('devnet');
    const base = `https://solscan.io/tx/${encodeURIComponent(r)}`;
    return isDev ? `${base}?cluster=devnet` : base;
  }

  /** Single-line display; full value in [title]. Ellipsis applied in CSS. */
  displayRef(ref: string | null | undefined): string {
    const r = ref?.trim();
    return r || '—';
  }

  async copyLedgerRef(ref: string | null | undefined) {
    const r = ref?.trim();
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r);
      this.showToast('success', 'Copied ref', 2200);
    } catch {
      this.showToast('error', 'Could not copy ref');
    }
  }

  setLedgerDirection(dir: 'all' | 'incoming' | 'outgoing') {
    if (this.ledgerDirection === dir) {
      return;
    }
    this.ledgerDirection = dir;
    void this.loadLedger();
  }

  toggleHistorySection() {
    this.historySectionOpen = !this.historySectionOpen;
    if (this.historySectionOpen) {
      void this.loadLedger();
    }
  }

  async loadLedger() {
    const addr = this.walletAuth.walletAddress?.trim();
    if (!addr) {
      return;
    }
    this.loadingLedger = true;
    try {
      const res = await this.claimyEdge.fetchCreditLedger(addr, {
        direction: this.ledgerDirection,
        limit: 80
      });
      this.ledgerEntries = res.ok && res.entries ? res.entries : [];
      if (!res.ok && res.error) {
        this.showToast('error', res.error);
      }
    } finally {
      this.loadingLedger = false;
    }
  }

  ngOnInit(): void {
    if (this.walletAuth.isLoggedIn) {
      void this.refreshBalance();
    }
  }

  ngAfterViewInit(): void {
    this.walletModalRef?.nativeElement.addEventListener('shown.bs.modal', this.onModalShown);
  }

  ngOnDestroy(): void {
    this.walletModalRef?.nativeElement.removeEventListener('shown.bs.modal', this.onModalShown);
    if (this.copyDepositResetId) clearTimeout(this.copyDepositResetId);
    if (this.copyMintResetId) clearTimeout(this.copyMintResetId);
    if (this.toastClearId) clearTimeout(this.toastClearId);
  }

  private showToast(type: 'error' | 'success' | 'info', text: string, ms = 7000) {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = { type, text };
    if (ms > 0) {
      this.toastClearId = setTimeout(() => {
        this.toast = null;
        this.toastClearId = null;
      }, ms);
    }
  }

  dismissToast() {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = null;
  }

  private static readonly creditsRefreshButtonMinMs = 2000;

  /** Modal open, init, post-withdraw — no cooldown. */
  async refreshBalance() {
    if (!this.walletAuth.isLoggedIn) return;
    this.loadingBalance = true;
    try {
      await this.credits.refresh();
    } finally {
      this.loadingBalance = false;
    }
  }

  /** Credits “Refresh” button: minimum 2s loading state so the balance can’t be spam-refreshed. */
  async refreshCreditsWithCooldown() {
    if (!this.walletAuth.isLoggedIn || !this.hasMintConfigured || this.loadingBalance) return;
    this.loadingBalance = true;
    const started = Date.now();
    try {
      await this.credits.refresh();
    } finally {
      const elapsed = Date.now() - started;
      const waitMore = Math.max(0, WalletDepositModalComponent.creditsRefreshButtonMinMs - elapsed);
      if (waitMore > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, waitMore));
      }
      this.loadingBalance = false;
    }
  }

  async refreshLinkedWallet(fromUserClick: boolean) {
    const addr = this.walletAuth.walletAddress?.trim();
    if (!addr) {
      this.linkedWalletError = 'No session wallet.';
      return;
    }
    this.verifyingLinkedWallet = true;
    this.linkedWalletError = null;
    try {
      const row = await this.claimyEdge.fetchLinkedRegistrationWallet(addr);
      if (!row) {
        this.serverVerifiedRegistrationWallet = null;
        this.linkedWalletUserVerified = false;
        this.linkedWalletVerifiedAt = null;
        this.linkedWalletError = 'Could not load linked wallet from Claimy. Check account-linked-wallet function.';
        if (fromUserClick) {
          this.showToast('error', this.linkedWalletError);
        }
        return;
      }
      if (row.registrationWallet !== addr) {
        this.serverVerifiedRegistrationWallet = null;
        this.linkedWalletUserVerified = false;
        this.linkedWalletVerifiedAt = null;
        this.showToast(
          'error',
          'Server returned a different wallet than your session. Sign out and sign in with your registered Phantom wallet.'
        );
        return;
      }
      this.serverVerifiedRegistrationWallet = row.registrationWallet;
      this.linkedWalletVerifiedAt = new Date();
      this.linkedWalletUserVerified = true;
      if (fromUserClick) {
        this.dismissToast();
      }
    } catch {
      this.serverVerifiedRegistrationWallet = null;
      this.linkedWalletUserVerified = false;
      this.linkedWalletError = 'Network error verifying linked wallet.';
      if (fromUserClick) {
        this.showToast('error', this.linkedWalletError);
      }
    } finally {
      this.verifyingLinkedWallet = false;
    }
  }

  async copyDepositAddress() {
    const addr = this.walletAuth.depositWalletAddress?.trim();
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      this.copiedDeposit = true;
      if (this.copyDepositResetId) clearTimeout(this.copyDepositResetId);
      this.copyDepositResetId = setTimeout(() => {
        this.copiedDeposit = false;
        this.copyDepositResetId = null;
      }, 1600);
    } catch {
      /* ignore */
    }
  }

  async copyMintAddress() {
    const mint = this.config.claimySplMintAddress?.trim();
    if (!mint) return;
    try {
      await navigator.clipboard.writeText(mint);
      this.copiedMint = true;
      if (this.copyMintResetId) clearTimeout(this.copyMintResetId);
      this.copyMintResetId = setTimeout(() => {
        this.copiedMint = false;
        this.copyMintResetId = null;
      }, 1600);
    } catch {
      /* ignore */
    }
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  private buildWithdrawMessage(amount: string): string {
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = this.toBase64(nonceBytes);
    const mint = this.config.claimySplMintAddress?.trim() || '(not configured)';
    return [
      'CLAIMY SPL withdraw',
      `username: ${this.walletAuth.username || '(unknown)'}`,
      `wallet: ${this.walletAuth.walletAddress || ''}`,
      `amount: ${amount}`,
      `mint: ${mint}`,
      `nonce: ${nonce}`,
      `timestamp: ${new Date().toISOString()}`
    ].join('\n');
  }

  async signAndSubmitWithdraw() {
    if (!this.hasMintConfigured) {
      this.showToast('error', 'Set the Claimy SPL mint in config before withdrawing.');
      return;
    }
    const dest = this.displayWithdrawDestination.trim();
    if (!dest) {
      this.showToast('error', 'No registered wallet on file. Verify address or sign in again.');
      return;
    }
    if (!this.serverVerifiedRegistrationWallet) {
      this.showToast('info', 'Verify your linked Phantom wallet with Claimy before withdrawing.');
      return;
    }
    const amt = this.withdrawAmount.trim();
    if (!amt || !/^\d+(\.\d+)?$/.test(amt) || parseFloat(amt) <= 0) {
      this.showToast('error', 'Enter a valid withdrawal amount greater than zero.');
      return;
    }
    if (parseFloat(amt) > this.creditsAmount + 1e-9) {
      this.showToast('error', 'Amount cannot exceed your Claimy Credits balance.');
      return;
    }

    const provider = (window as unknown as { phantom?: { solana?: PhantomSolanaProvider } }).phantom?.solana;
    if (!provider) {
      this.showToast('error', 'Phantom not found. Install Phantom to sign withdrawals.');
      return;
    }

    this.withdrawBusy = true;
    this.dismissToast();
    try {
      const conn = await provider.connect();
      const pk =
        (conn as { publicKey?: { toString?: () => string } })?.publicKey?.toString?.() ?? '';
      if (pk !== this.walletAuth.walletAddress?.trim()) {
        this.showToast(
          'error',
          'Connected Phantom wallet does not match your Claimy login wallet. Switch account in Phantom.'
        );
        return;
      }

      const message = this.buildWithdrawMessage(amt);
      const encoded = new TextEncoder().encode(message);
      const signed = await provider.signMessage(encoded, 'utf8');
      const signatureBytes: Uint8Array =
        signed && typeof signed === 'object' && 'signature' in signed && (signed as { signature: unknown }).signature instanceof Uint8Array
          ? (signed as { signature: Uint8Array }).signature
          : signed instanceof Uint8Array
            ? signed
            : new Uint8Array(0);
      if (!signatureBytes.length) {
        this.showToast('error', 'Could not sign withdrawal message.');
        return;
      }

      const res = await this.claimyEdge.submitWithdrawRequest({
        walletAddress: this.walletAuth.walletAddress!.trim(),
        message,
        signatureBase64: this.toBase64(signatureBytes),
        amount: amt,
        mint: this.config.claimySplMintAddress?.trim()
      });

      if (res.ok) {
        const sig = res.signature?.trim();
        const tail = sig && sig.length > 10 ? ` Tx: …${sig.slice(-10)}` : sig ? ` Tx: ${sig}` : '';
        if (res.ledgerError) {
          this.showToast(
            'info',
            `Withdrawal submitted.${tail} Balance log: ${res.ledgerError}`,
            12000
          );
        } else {
          this.showToast('success', `Withdrawal submitted.${tail}`, 8000);
        }
        this.withdrawAmount = '';
        void this.refreshBalance();
        if (this.historySectionOpen) {
          void this.loadLedger();
        }
        return;
      }

      const msg = res.error ?? 'Withdrawal request failed.';
      if (
        res.signatureValid ||
        /verified|not enabled|not enabled yet|vault|on-chain|decimal|ATA|mint|solana rpc|configured/i.test(msg)
      ) {
        this.showToast('info', msg, 12000);
      } else {
        this.showToast('error', msg);
      }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Withdrawal cancelled or failed.';
      this.showToast('error', m);
    } finally {
      this.withdrawBusy = false;
    }
  }
}
