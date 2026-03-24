import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClaimyCreditsService } from 'src/app/services/claimy-credits.service';
import { ConfigService } from 'src/app/services/config.service';
import { LoginModalService } from 'src/app/services/login-modal.service';
import { PlayerRankingService, PlayerRankingSnapshot } from 'src/app/services/player-ranking.service';
import { RankLadderService } from 'src/app/services/rank-ladder.service';
import { WalletModalService } from 'src/app/services/wallet-modal.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent implements OnInit, OnDestroy {
  private walletModalSub?: Subscription;
  private rankSnapSub?: Subscription;
  private rankToastSub?: Subscription;
  private rankToastClearId: ReturnType<typeof setTimeout> | null = null;

  /** Latest ranking snapshot for nav badge (null until loaded or on error). */
  rankSnap: PlayerRankingSnapshot | null = null;
  rankToastMessage: string | null = null;

  constructor(
    public configService: ConfigService,
    public walletAuth: WalletAuthService,
    public readonly ranks: RankLadderService,
    public readonly playerRanking: PlayerRankingService,
    private readonly router: Router,
    private readonly loginModal: LoginModalService,
    private readonly walletModal: WalletModalService,
    private readonly claimyCredits: ClaimyCreditsService
  ) {}

  /** Same rules as wallet modal / credits row. */
  get hasMintConfigured(): boolean {
    return !!this.configService.claimySplMintAddress?.trim();
  }

  ngOnInit() {
    if (this.walletAuth.isLoggedIn) {
      void this.claimyCredits.refresh();
    }

    this.rankSnapSub = this.playerRanking.snapshot$.subscribe((s: PlayerRankingSnapshot | null) => {
      this.rankSnap = s;
    });
    this.playerRanking.initFromSession();
    this.rankToastSub = this.playerRanking.rankToast$.subscribe((evt) => {
      if (!evt?.message) return;
      this.rankToastMessage = evt.message;
      if (this.rankToastClearId) clearTimeout(this.rankToastClearId);
      this.rankToastClearId = setTimeout(() => {
        this.rankToastMessage = null;
        this.rankToastClearId = null;
      }, 6500);
    });

    this.walletModalSub = this.walletModal.openRequested$.subscribe(() => {
      const el = document.getElementById('claimyWalletModal');
      const w = window as unknown as {
        bootstrap?: { Modal: { getOrCreateInstance: (e: Element) => { show: () => void } } };
      };
      if (el && w.bootstrap?.Modal?.getOrCreateInstance) {
        w.bootstrap.Modal.getOrCreateInstance(el).show();
      }
    });
  }

  ngOnDestroy() {
    this.walletModalSub?.unsubscribe();
    this.rankSnapSub?.unsubscribe();
    this.rankToastSub?.unsubscribe();
    if (this.rankToastClearId) {
      clearTimeout(this.rankToastClearId);
      this.rankToastClearId = null;
    }
  }

  logout() {
    this.playerRanking.clear();
    this.rankSnap = null;
    this.walletAuth.logout();
    void this.router.navigate(['/home']);
  }

  /** Opens login modal; keeps `/login` as a no-JS fallback via href. */
  openLoginModal(event: Event) {
    event.preventDefault();
    const path = this.router.url.split('?')[0];
    if (path === '/login') {
      return;
    }
    this.loginModal.open();
  }

  accountInitial(username: string | null | undefined): string {
    const u = username?.trim();
    if (!u) return '?';
    return u.charAt(0).toUpperCase();
  }
}
