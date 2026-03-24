-- =============================================================================
-- Claimy — read-only Supabase verification (Dashboard → SQL → Run)
-- Does not call Edge Functions or Solana. For withdraw nonces, rows appear only
-- after a withdraw attempt reaches the nonce step (see DEVELOPERWORK/SUPABASE_SETUP.md §7).
-- =============================================================================

-- --- Schema: claimy_users ---
-- 1) Columns (expect deposit_wallet_* among others)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'claimy_users'
ORDER BY ordinal_position;

-- 2) Row counts
SELECT
  count(*) AS total_users,
  count(deposit_wallet_public_key) AS rows_with_deposit_public_key,
  count(deposit_wallet_private_key_encrypted) AS rows_with_encrypted_secret
FROM public.claimy_users;

-- 3) Recent users (Phantom vs custodial deposit)
SELECT
  username,
  created_at,
  wallet_address AS phantom_login_wallet,
  deposit_wallet_public_key AS spl_deposit_wallet,
  (wallet_address IS DISTINCT FROM deposit_wallet_public_key) AS deposit_differs_from_phantom
FROM public.claimy_users
ORDER BY created_at DESC
LIMIT 15;

-- 4) Bad rows: encrypted blob missing when deposit public key exists (expect 0 rows)
SELECT id, username
FROM public.claimy_users
WHERE deposit_wallet_public_key IS NOT NULL
  AND (
    deposit_wallet_private_key_encrypted IS NULL
    OR length(trim(deposit_wallet_private_key_encrypted)) < 10
  );

-- 5) Indexes on claimy_users
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'claimy_users';

-- --- Withdraw DB readiness (withdraw-spl) ---
-- 6) claimy_withdraw_nonces table exists
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'claimy_withdraw_nonces'
) AS claimy_withdraw_nonces_exists;

-- 7) Columns on claimy_withdraw_nonces
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'claimy_withdraw_nonces'
ORDER BY ordinal_position;

-- 8) Users eligible for withdraw-spl (have custodial deposit address)
SELECT
  username,
  wallet_address AS phantom_wallet,
  deposit_wallet_public_key AS deposit_ata_owner_address
FROM public.claimy_users
WHERE deposit_wallet_public_key IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- 9) Recent withdraw nonce rows
SELECT wallet_address, nonce, created_at
FROM public.claimy_withdraw_nonces
ORDER BY created_at DESC
LIMIT 20;

-- 10) Summary counts
SELECT
  (SELECT count(*) FROM public.claimy_users) AS users,
  (SELECT count(*) FROM public.claimy_users WHERE deposit_wallet_public_key IS NOT NULL) AS users_with_deposit,
  (SELECT count(*) FROM public.claimy_withdraw_nonces) AS withdraw_nonce_rows;
