import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Last verified wallet from login — survives full page refresh so games/credits can resolve the wallet before Phantom injects. */
const SESSION_WALLET_KEY = 'claimy.sessionWallet';

/** Session bridge: registration can return `createdAt` before the next `wallet-login` call. */
const CREATED_AT_STORAGE_PREFIX = 'claimy.accountCreatedAt:';

/** Session bridge for custodial deposit address returned from `register-phantom`. */
const DEPOSIT_ADDRESS_STORAGE_PREFIX = 'claimy.depositAddress:';

@Injectable({
  providedIn: 'root'
})
export class WalletAuthService {
  isLoggedIn = false;
  username: string | null = null;
  walletAddress: string | null = null;
  /** ISO string from DB `claimy_users.created_at` (via wallet-login and/or right after register). */
  accountCreatedAt: string | null = null;

  /** Custodial SOL deposit address (public); private key only on server (encrypted). */
  depositWalletAddress: string | null = null;

  /** Invite code for this account (from wallet-login). */
  referralCode: string | null = null;

  /** How many users registered with this account's referral code. */
  referralCount: number | null = null;

  /**
   * Optional provably-fair client seed (stored in DB). Used by Flowerpoker and future games when set.
   * Null means each bet can fall back to a server random seed unless you save one in Account settings.
   */
  gamesClientSeed: string | null = null;

  // Updated from chain (1 SPL token balance = 1 credit at same decimals).
  claimyCreditsBalance: number | null = null;

  /** Placeholder until ranks are implemented server-side. */
  readonly rankDisplay = '—';

  /** Emits after a successful `loginWithWallet` (e.g. modal login while staying on the same route). */
  readonly loginSucceeded$ = new Subject<void>();

  /** Wallet from last `loginWithWallet` (sessionStorage). Survives refresh before in-memory state is restored. */
  getPersistedSessionWallet(): string | null {
    try {
      const w = sessionStorage.getItem(SESSION_WALLET_KEY)?.trim();
      return w || null;
    } catch {
      return null;
    }
  }

  /** Shown as a toast on `/home` right after login (consumed once). */
  private pendingWelcomeToast: string | null = null;

  setPendingWelcomeToast(message: string) {
    this.pendingWelcomeToast = message.trim() || null;
  }

  consumePendingWelcomeToast(): string | null {
    const m = this.pendingWelcomeToast;
    this.pendingWelcomeToast = null;
    return m;
  }

  /**
   * Call after successful registration if `register-phantom` returns `{ createdAt }` so the next
   * login can show account created before `wallet-login` is redeployed.
   */
  rememberRegistrationCreatedAt(walletAddress: string, createdAt: string | null | undefined) {
    const w = walletAddress?.trim();
    const c = createdAt?.trim();
    if (!w || !c) return;
    try {
      sessionStorage.setItem(`${CREATED_AT_STORAGE_PREFIX}${w}`, c);
    } catch {
      /* ignore quota / private mode */
    }
  }

  rememberRegistrationDepositAddress(
    walletAddress: string,
    depositAddress: string | null | undefined
  ) {
    const w = walletAddress?.trim();
    const d = depositAddress?.trim();
    if (!w || !d) return;
    try {
      sessionStorage.setItem(`${DEPOSIT_ADDRESS_STORAGE_PREFIX}${w}`, d);
    } catch {
      /* ignore */
    }
  }

  loginWithWallet(
    username: string,
    walletAddress: string,
    createdAt?: string | null,
    depositAddress?: string | null,
    referralCode?: string | null,
    referralCount?: number | null,
    gamesClientSeed?: string | null
  ) {
    const w = walletAddress.trim();
    const createdKey = `${CREATED_AT_STORAGE_PREFIX}${w}`;
    let resolved = createdAt ?? null;
    if (!resolved) {
      try {
        resolved = sessionStorage.getItem(createdKey);
        if (resolved) {
          sessionStorage.removeItem(createdKey);
        }
      } catch {
        /* ignore */
      }
    } else {
      try {
        sessionStorage.removeItem(createdKey);
      } catch {
        /* ignore */
      }
    }

    const depositKey = `${DEPOSIT_ADDRESS_STORAGE_PREFIX}${w}`;
    let resolvedDeposit = depositAddress?.trim() || null;
    if (!resolvedDeposit) {
      try {
        resolvedDeposit = sessionStorage.getItem(depositKey);
        if (resolvedDeposit) {
          sessionStorage.removeItem(depositKey);
        }
      } catch {
        /* ignore */
      }
    } else {
      try {
        sessionStorage.removeItem(depositKey);
      } catch {
        /* ignore */
      }
    }

    this.username = username;
    this.walletAddress = w;
    this.accountCreatedAt = resolved;
    this.depositWalletAddress = resolvedDeposit;
    this.referralCode = referralCode?.trim() || null;
    this.referralCount =
      typeof referralCount === "number" && Number.isFinite(referralCount) ? referralCount : null;
    const gs = gamesClientSeed?.trim();
    this.gamesClientSeed = gs && gs.length > 0 ? gs : null;
    this.isLoggedIn = true;
    this.loginSucceeded$.next();
  }

  login() {
    this.isLoggedIn = true;
  }

  logout() {
    this.isLoggedIn = false;
    this.username = null;
    this.walletAddress = null;
    this.accountCreatedAt = null;
    this.depositWalletAddress = null;
    this.referralCode = null;
    this.referralCount = null;
    this.gamesClientSeed = null;
    this.claimyCreditsBalance = null;
    this.pendingWelcomeToast = null;
    try {
      sessionStorage.removeItem(SESSION_WALLET_KEY);
    } catch {
      /* ignore */
    }
  }
}
