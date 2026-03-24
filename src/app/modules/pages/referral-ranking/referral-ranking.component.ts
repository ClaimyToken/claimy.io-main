import { Component, OnDestroy, OnInit } from '@angular/core';
import { ClaimyEdgeService } from 'src/app/services/claimy-edge.service';
import { LoginModalService } from 'src/app/services/login-modal.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';

const LEADERBOARD_MAX = 15;

export type ReferralLeaderboardSlot =
  | { kind: 'user'; username: string; referralCount: number }
  | { kind: 'empty' };

@Component({
  selector: 'app-referral-ranking',
  templateUrl: './referral-ranking.component.html',
  styleUrls: ['./referral-ranking.component.scss']
})
export class ReferralRankingComponent implements OnInit, OnDestroy {
  readonly leaderboardMax = LEADERBOARD_MAX;

  referralRows: { username: string; referralCount: number }[] = [];
  referralLoading = true;
  referralError: string | null = null;

  showReferralModal = false;
  /** True while fetching code (modal + trigger button). */
  modalLoading = false;
  /** True from click until fetch completes — spinner on “Show my referral code”. */
  referralButtonLoading = false;
  modalCode: string | null = null;
  modalCount: number | null = null;
  modalError: string | null = null;
  copiedCode = false;
  private copyResetId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly edge: ClaimyEdgeService,
    readonly walletAuth: WalletAuthService,
    private readonly loginModal: LoginModalService
  ) {}

  /** Always 15 rows: real users first, then empty slots (0-referral accounts are not listed). */
  get leaderboardSlots(): ReferralLeaderboardSlot[] {
    const slots: ReferralLeaderboardSlot[] = [];
    const rows = this.referralRows;
    for (let i = 0; i < LEADERBOARD_MAX; i++) {
      if (i < rows.length) {
        slots.push({
          kind: 'user',
          username: rows[i].username,
          referralCount: rows[i].referralCount
        });
      } else {
        slots.push({ kind: 'empty' });
      }
    }
    return slots;
  }

  ngOnInit() {
    void this.loadReferralLeaderboard();
  }

  ngOnDestroy() {
    if (this.copyResetId) {
      clearTimeout(this.copyResetId);
    }
  }

  async loadReferralLeaderboard() {
    this.referralLoading = true;
    this.referralError = null;
    const res = await this.edge.fetchReferralLeaderboard();
    this.referralLoading = false;
    if (res.ok && res.rows) {
      this.referralRows = res.rows.filter(
        (r) => typeof r.referralCount === 'number' && Number.isFinite(r.referralCount) && r.referralCount >= 1
      );
    } else {
      this.referralError = res.error ?? 'Could not load leaderboard.';
      this.referralRows = [];
    }
  }

  openReferralModal() {
    if (!this.walletAuth.isLoggedIn || !this.walletAuth.walletAddress) {
      this.loginModal.open({ returnUrl: '/referrals' });
      return;
    }
    this.referralButtonLoading = true;
    this.modalError = null;
    this.modalCode = null;
    this.modalCount = null;
    this.modalLoading = true;
    this.showReferralModal = true;
    void this.refreshModalReferral();
  }

  async refreshModalReferral() {
    const w = this.walletAuth.walletAddress?.trim();
    if (!w) {
      this.modalLoading = false;
      this.referralButtonLoading = false;
      return;
    }
    this.modalLoading = true;
    const res = await this.edge.fetchMyReferral(w);
    this.modalLoading = false;
    this.referralButtonLoading = false;
    if (res.ok) {
      this.modalCode = res.referralCode ?? null;
      this.modalCount = res.referralCount ?? 0;
    } else {
      this.modalError = res.error ?? 'Could not load your referral code.';
    }
  }

  closeReferralModal() {
    this.showReferralModal = false;
    this.referralButtonLoading = false;
  }

  async copyReferralCode() {
    const c = this.modalCode?.trim();
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c);
      this.copiedCode = true;
      if (this.copyResetId) clearTimeout(this.copyResetId);
      this.copyResetId = setTimeout(() => {
        this.copiedCode = false;
      }, 1600);
    } catch {
      /* ignore */
    }
  }
}
