import { Injectable } from '@angular/core';
import { CLAIMY_LAUNCH } from 'src/app/config/claimy-launch.config';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  getSiteStatus(): string {
    return 'online'; // Online or Offline to disable pages + landing page button
  }

  /** Branding — from `claimy-launch.config.ts`. */
  siteName = CLAIMY_LAUNCH.siteName;
  /** Site host without scheme (footer/legal). */
  siteLink = CLAIMY_LAUNCH.siteDisplayHost;

  /** Supabase project URL (no trailing slash). Edge Functions: `{supabaseUrl}/functions/v1/...` */
  supabaseUrl = environment.supabaseUrl.replace(/\/$/, '');

  /**
   * Supabase anon (public) key — same as Dashboard → Settings → API → anon public.
   * Set `CLAIMY_SUPABASE_ANON_KEY` in `.env` and run `node scripts/sync-env.cjs`.
   * Needed for Edge Function calls that require `apikey` / `Authorization` headers.
   */
  supabaseAnonKey = environment.supabaseAnonKey?.trim() ?? '';

  TokenContractAddress = CLAIMY_LAUNCH.legacyEthTokenAddress;
  RewardsContractAddress = CLAIMY_LAUNCH.legacyEthTokenAddress;

  twitterName = CLAIMY_LAUNCH.twitterHandle;
  twitterLink = `https://x.com/${CLAIMY_LAUNCH.twitterHandle}`;
  telegramName = CLAIMY_LAUNCH.telegramHandle;
  telegramLink = `https://t.me/${CLAIMY_LAUNCH.telegramHandle}`;
  githubName = CLAIMY_LAUNCH.githubOrg;
  githubLink = `https://github.com/${CLAIMY_LAUNCH.githubOrg}/${CLAIMY_LAUNCH.githubRepo}`;
  coinmarketcapLink = CLAIMY_LAUNCH.coinmarketcapUrl;
  coingeckoLink = CLAIMY_LAUNCH.coingeckoUrl;

  /** Solana JSON-RPC (e.g. public mainnet or Shyft — see .env / environment). */
  solanaRpcUrl = environment.solanaRpcUrl;

  /**
   * Claimy SPL token mint (base58). From `.env` → sync script when developing, or `environment.prod.ts` for production builds.
   */
  claimySplMintAddress = environment.claimySplMintAddress;

  /**
   * When false, the Referrals page is hidden from navigation and `/referrals` redirects to home.
   * Registration can still accept referral codes; backend is unchanged.
   */
  referralsPageEnabled = false;

  constructor() { }

  /** Trimmed SPL mint, or empty if not configured. */
  get claimyTokenMint(): string {
    return this.claimySplMintAddress?.trim() ?? '';
  }

  /** Solscan token page when mint is set. */
  get claimySolscanTokenUrl(): string {
    const m = this.claimyTokenMint;
    return m ? `https://solscan.io/token/${m}` : '';
  }

  /** DexScreener (Solana) pair/token view. */
  get claimyDexscreenerTokenUrl(): string {
    const m = this.claimyTokenMint;
    return m ? `https://dexscreener.com/solana/${m}` : '';
  }

  /** pump.fun coin page — same pattern as Solscan/DexScreener; only the mint differs. */
  get claimyPumpFunCoinUrl(): string {
    const m = this.claimyTokenMint;
    return m ? `https://pump.fun/coin/${m}` : '';
  }

  /** Treasury wallet from launch config (trimmed). Empty = not announced yet. */
  get treasuryWalletAddress(): string {
    return (CLAIMY_LAUNCH.treasuryWalletAddress ?? '').trim();
  }

  /** Solscan account link when treasury is set. */
  get claimyTreasurySolscanUrl(): string {
    const w = this.treasuryWalletAddress;
    return w ? `https://solscan.io/account/${w}` : '';
  }
}
