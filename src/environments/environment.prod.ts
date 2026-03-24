/**
 * Production `ng build` (default configuration). Edit here or your deploy pipeline — not read from .env.
 *
 * `supabaseAnonKey` is the public anon key (Dashboard → Settings → API). It must be present for browser
 * calls to Edge Functions; without `apikey` + `Authorization`, the Supabase gateway rejects the request and
 * the browser often reports only "Failed to fetch" (CORS masks the real error).
 *
 * `claimySplMintAddress` must match your CLAIMY SPL mint (same as `.env` / `env.overrides.ts` for dev). If empty,
 * the nav credits chip and on-chain balance reads stay hidden in production.
 *
 * `solanaRpcUrl`: public mainnet RPC works; for heavier traffic use a provider URL (e.g. Shyft) via Netlify env + a future build-time inject, or paste the same HTTPS RPC you use locally (keys in client bundles are visible — prefer rate-limited keys).
 */
export const environment = {
  production: true,
  supabaseUrl: 'https://mosmjagamrtsyeoohcty.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vc21qYWdhbXJ0c3llb29oY3R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzYxOTQsImV4cCI6MjA4OTU1MjE5NH0.1NUfVb3kOMhqJfeE_DxG0YFu7g9TFs7K4ZnuQqBMaWo',
  /** Same mint as dev — required for nav credits + SPL reads on Netlify. */
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  claimySplMintAddress: 'CVNAP5GpSBVQfqtqfu4jVRMVYmTKBqS5a5mDMPFUpump'
};
