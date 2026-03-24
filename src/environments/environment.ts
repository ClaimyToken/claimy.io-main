import { envOverrides } from './env.overrides';

/**
 * Local / `ng serve` (development build). Values merge: `.env` → env.overrides.ts → fallbacks below.
 * Production uses `environment.prod.ts` via angular.json fileReplacements (no .env).
 */
export const environment = {
  production: false,
  supabaseUrl: envOverrides.supabaseUrl?.trim() || 'https://mosmjagamrtsyeoohcty.supabase.co',
  /** Public anon key (Dashboard → Settings → API). Required for some Edge Function calls from the browser. */
  supabaseAnonKey: envOverrides.supabaseAnonKey?.trim() || '',
  solanaRpcUrl: envOverrides.solanaRpcUrl?.trim() || 'https://api.mainnet-beta.solana.com',
  claimySplMintAddress: envOverrides.claimySplMintAddress?.trim() || ''
};
