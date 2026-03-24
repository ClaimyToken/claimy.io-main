import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { ClaimyCreditsService } from 'src/app/services/claimy-credits.service';
import { ClaimyEdgeService } from 'src/app/services/claimy-edge.service';
import { ConfigService } from 'src/app/services/config.service';
import { LoginModalService } from 'src/app/services/login-modal.service';
import { PlayerRankingService } from 'src/app/services/player-ranking.service';
import { RankLadderService } from 'src/app/services/rank-ladder.service';
import { WalletModalService } from 'src/app/services/wallet-modal.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.scss']
})
export class AccountSettingsComponent implements OnInit, OnDestroy {
  /** Which tab is visible when logged in. */
  settingsTab: 'account' | 'ranking' = 'account';

  copiedDeposit = false;
  creditsLoading = false;
  private copyDepositResetId: ReturnType<typeof setTimeout> | null = null;
  private loginSucceededSub?: Subscription;

  /** Read-only display; set via Random or loaded from server. */
  gamesSeedInput = '';
  gamesSeedSaving = false;
  toast: { type: 'success' | 'error'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public walletAuth: WalletAuthService,
    public config: ConfigService,
    public readonly playerRanking: PlayerRankingService,
    public readonly ranks: RankLadderService,
    private readonly credits: ClaimyCreditsService,
    private readonly claimyEdge: ClaimyEdgeService,
    private readonly walletModal: WalletModalService,
    private readonly loginModal: LoginModalService
  ) {}

  openWalletModal() {
    this.walletModal.requestOpen();
  }

  hasMintConfigured(): boolean {
    return !!this.config.claimySplMintAddress?.trim();
  }

  get solscanDepositUrl(): string {
    const a = this.walletAuth.depositWalletAddress?.trim();
    return a ? `https://solscan.io/account/${encodeURIComponent(a)}` : '';
  }

  ngOnInit() {
    if (!this.walletAuth.isLoggedIn) {
      this.loginSucceededSub = this.walletAuth.loginSucceeded$
        .pipe(take(1))
        .subscribe(() => void this.loadCreditsAndSeed());
      this.loginModal.open({ returnUrl: '/account-settings' });
      return;
    }
    void this.loadCreditsAndSeed();
    void this.playerRanking.refresh();
  }

  ngOnDestroy(): void {
    this.loginSucceededSub?.unsubscribe();
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    if (this.copyDepositResetId) {
      clearTimeout(this.copyDepositResetId);
      this.copyDepositResetId = null;
    }
  }

  private flashToast(message: string, durationMs = 3800, kind: 'success' | 'error' = 'success'): void {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = { type: kind, message };
    this.toastClearId = setTimeout(() => {
      this.toast = null;
      this.toastClearId = null;
    }, durationMs);
  }

  private async loadCreditsAndSeed() {
    this.creditsLoading = true;
    try {
      await this.credits.refresh();
      await this.syncGamesClientSeedFromServer();
    } finally {
      this.creditsLoading = false;
    }
  }

  private async syncGamesClientSeedFromServer() {
    const w = this.walletAuth.walletAddress?.trim();
    if (!w) return;
    const res = await this.claimyEdge.fetchWalletLogin(w);
    if (res.found && res.gamesClientSeed !== undefined) {
      this.walletAuth.gamesClientSeed = res.gamesClientSeed ?? null;
    }
    this.gamesSeedInput = this.walletAuth.gamesClientSeed ?? '';
  }

  async saveGamesClientSeed() {
    const w = this.walletAuth.walletAddress?.trim();
    if (!w) return;
    const raw = this.gamesSeedInput.trim();
    const seed = raw.length === 0 ? null : raw.slice(0, 128);
    this.gamesSeedSaving = true;
    try {
      const res = await this.claimyEdge.setGamesClientSeed({ walletAddress: w, gamesClientSeed: seed });
      if (res.ok) {
        this.walletAuth.gamesClientSeed = res.gamesClientSeed ?? null;
        this.gamesSeedInput = this.walletAuth.gamesClientSeed ?? '';
        const cleared = !this.walletAuth.gamesClientSeed;
        this.flashToast(
          cleared ? 'Client seed cleared.' : 'New client seed saved.',
          4000,
          'success'
        );
      } else {
        this.flashToast(res.error ?? 'Could not save.', 5200, 'error');
      }
    } finally {
      this.gamesSeedSaving = false;
    }
  }

  randomizeGamesClientSeed() {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.gamesSeedInput = id.slice(0, 128);
  }

  async clearGamesClientSeed() {
    this.gamesSeedInput = '';
    await this.saveGamesClientSeed();
  }

  async copyDepositAddress() {
    const addr = this.walletAuth.depositWalletAddress?.trim();
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      this.copiedDeposit = true;
      if (this.copyDepositResetId) {
        clearTimeout(this.copyDepositResetId);
      }
      this.copyDepositResetId = setTimeout(() => {
        this.copiedDeposit = false;
        this.copyDepositResetId = null;
      }, 1600);
    } catch {
      /* ignore */
    }
  }
}
