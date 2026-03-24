/**
 * Production `ng build` (default configuration).
 *
 * On **Netlify / CI**, `npm run build` runs `scripts/inject-env-prod.cjs` first, which **overwrites** this file
 * from environment variables (see `netlify.toml` and `env.template`). Locally, inject skips unless you set
 * `NETLIFY=true`, `CI=true`, `CLAIMY_FORCE_ENV_INJECT=1`, or any `CLAIMY_*` override — so edits here stay for dev.
 *
 * `supabaseAnonKey` is the public anon key (Dashboard → Settings → API).
 * `claimySplMintAddress` is public on-chain (required for nav credits + SPL reads).
 */
export const environment = {
  production: true,
  supabaseUrl: 'https://mosmjagamrtsyeoohcty.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vc21qYWdhbXJ0c3llb29oY3R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzYxOTQsImV4cCI6MjA4OTU1MjE5NH0.1NUfVb3kOMhqJfeE_DxG0YFu7g9TFs7K4ZnuQqBMaWo',
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  claimySplMintAddress: 'CVNAP5GpSBVQfqtqfu4jVRMVYmTKBqS5a5mDMPFUpump'
};
