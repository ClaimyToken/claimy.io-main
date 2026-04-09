import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  getSiteStatus(): string {
    return 'online'; // Online or Offline to disable pages + landing page button
  }

  siteName: string = 'CLAIMY';
  siteLink: string = 'claimy-project.io';

  /** Supabase project URL (no trailing slash). Edge Functions: `{supabaseUrl}/functions/v1/...` */
  supabaseUrl = environment.supabaseUrl.replace(/\/$/, '');

  /**
   * Supabase anon (public) key — same as Dashboard → Settings → API → anon public.
   * Set `CLAIMY_SUPABASE_ANON_KEY` in `.env` and run `node scripts/sync-env.cjs`.
   * Needed for Edge Function calls that require `apikey` / `Authorization` headers.
   */
  supabaseAnonKey = environment.supabaseAnonKey?.trim() ?? '';

  TokenContractAddress: string = '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF';
  RewardsContractAddress: string = '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF';

  twitterName: string = 'claimyproject';
  twitterLink: string = `https://x.com/${this.twitterName}`;
  telegramName: string = 'claimyproject';
  telegramLink: string = `https://t.me/${this.telegramName}`;
  githubName: string = 'ClaimyToken';
  githubLink: string = `https://github.com/${this.githubName}/claimy.io-main`;
  coinmarketcapLink: string = 'https://coinmarketcap.com/currencies/solana/';
  coingeckoLink: string = 'https://www.coingecko.com/en/coins/solana';

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
}
