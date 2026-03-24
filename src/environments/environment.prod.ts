/**
 * Production `ng build` (default configuration). Edit here or your deploy pipeline — not read from .env.
 *
 * `supabaseAnonKey` is the public anon key (Dashboard → Settings → API). It must be present for browser
 * calls to Edge Functions; without `apikey` + `Authorization`, the Supabase gateway rejects the request and
 * the browser often reports only "Failed to fetch" (CORS masks the real error).
 */
export const environment = {
  production: true,
  supabaseUrl: 'https://mosmjagamrtsyeoohcty.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vc21qYWdhbXJ0c3llb29oY3R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzYxOTQsImV4cCI6MjA4OTU1MjE5NH0.1NUfVb3kOMhqJfeE_DxG0YFu7g9TFs7K4ZnuQqBMaWo',
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  claimySplMintAddress: ''
};
