import { Injectable } from '@angular/core';
import { ClaimyEdgeService } from './claimy-edge.service';
import { ConfigService } from './config.service';
import { SplTokenBalanceService } from './spl-token-balance.service';
import { WalletAuthService } from './wallet-auth.service';

/**
 * Claimy Credits: 1) **`sync_from_chain`** (Edge) reconciles DB with on-chain deposit ATA.
 * 2) If sync isn’t available or fails, read **on-chain SPL** from the browser RPC (so new deposits show).
 * 3) Last resort: **`get`** DB-only (avoids lying when chain read fails).
 */
@Injectable({
  providedIn: 'root'
})
export class ClaimyCreditsService {
  constructor(
    private readonly walletAuth: WalletAuthService,
    private readonly config: ConfigService,
    private readonly spl: SplTokenBalanceService,
    private readonly claimyEdge: ClaimyEdgeService
  ) {}

  async refresh(): Promise<void> {
    if (!this.walletAuth.isLoggedIn || !this.walletAuth.depositWalletAddress?.trim()) {
      this.walletAuth.claimyCreditsBalance = null;
      return;
    }
    const mint = this.config.claimySplMintAddress?.trim();
    if (!mint) {
      this.walletAuth.claimyCreditsBalance = null;
      return;
    }

    const phantom = this.walletAuth.walletAddress?.trim();
    if (phantom) {
      const afterSync = await this.claimyEdge.syncPlayableFromChain(phantom);
      if (afterSync !== null) {
        this.walletAuth.claimyCreditsBalance = afterSync;
        return;
      }
    }

    try {
      const n = await this.spl.getSplBalance(
        this.walletAuth.depositWalletAddress,
        mint,
        this.config.solanaRpcUrl
      );
      this.walletAuth.claimyCreditsBalance = n;
      return;
    } catch {
      /* fall through */
    }

    if (phantom) {
      const fromDb = await this.claimyEdge.fetchPlayableBalance(phantom);
      if (fromDb !== null) {
        this.walletAuth.claimyCreditsBalance = fromDb;
        return;
      }
    }

    this.walletAuth.claimyCreditsBalance = null;
  }
}
