/**
 * Claimy public launch settings — edit this file before go-live.
 *
 * - **Mint** is the canonical default for `environment` when `.env` / CI does not override.
 *   Production builds can still set `CLAIMY_SPL_MINT` (see `scripts/inject-env-prod.cjs`).
 * - **Treasury** and other fields are read by `ConfigService` for the whole app.
 */
export const CLAIMY_LAUNCH = {
  siteName: 'CLAIMY',
  /** Shown in footer / landing (no https://). */
  siteDisplayHost: 'claimy-project.io',

  /**
   * SPL token mint (base58), e.g. pump.fun token.
   * Keep in sync with `CLAIMY_SPL_MINT` if you use Netlify env inject.
   */
  claimySplMintAddress: 'CVNAP5GpSBVQfqtqfu4jVRMVYmTKBqS5a5mDMPFUpump',

  /** Solana treasury / ops wallet. Leave empty to show “TBA” on the landing page. */
  treasuryWalletAddress: '5kimaiQnhEsFGnRN54FjpAPswFL152BjcgwStWhrFMkE',

  twitterHandle: 'claimyproject',
  telegramHandle: 'claimyproject',
  githubOrg: 'ClaimyToken',
  githubRepo: 'claimy.io-main',

  coinmarketcapUrl: 'https://coinmarketcap.com/currencies/solana/',
  coingeckoUrl: 'https://www.coingecko.com/en/coins/solana',

  /** Legacy EVM placeholder (footer / old links). */
  legacyEthTokenAddress: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF'
} as const;
