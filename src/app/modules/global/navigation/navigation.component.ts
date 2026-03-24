import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClaimyCreditsService } from 'src/app/services/claimy-credits.service';
import { ConfigService } from 'src/app/services/config.service';
import { WalletModalService } from 'src/app/services/wallet-modal.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent implements OnInit, OnDestroy {
  private walletModalSub?: Subscription;

  constructor(
    public configService: ConfigService,
    public walletAuth: WalletAuthService,
    private readonly router: Router,
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
  }

  logout() {
    this.walletAuth.logout();
    void this.router.navigate(['/home']);
  }

  accountInitial(username: string | null | undefined): string {
    const u = username?.trim();
    if (!u) return '?';
    return u.charAt(0).toUpperCase();
  }
}
