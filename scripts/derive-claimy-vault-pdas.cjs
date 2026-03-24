/**
 * Print Claimy vault PDAs and vault SPL token account for a mint.
 * Usage: node scripts/derive-claimy-vault-pdas.cjs <PROGRAM_ID> <MINT_PUBKEY>
 *
 * Requires: npm install (see devDependencies: @solana/web3.js, @solana/spl-token)
 */
const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');

const STATE_SEED = Buffer.from('state');
const VAULT_SEED = Buffer.from('vault');

function main() {
  const programIdStr = process.argv[2];
  const mintStr = process.argv[3];
  if (!programIdStr || !mintStr) {
    console.error('Usage: node scripts/derive-claimy-vault-pdas.cjs <PROGRAM_ID> <MINT_PUBKEY>');
    process.exit(1);
  }
  const programId = new PublicKey(programIdStr);
  const mint = new PublicKey(mintStr);

  const [vaultState] = PublicKey.findProgramAddressSync([STATE_SEED, mint.toBuffer()], programId);
  const [vaultAuthority, vaultBump] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, mint.toBuffer()],
    programId
  );

  const vaultTokenAccount = getAssociatedTokenAddressSync(mint, vaultAuthority, true);

  console.log('Program ID:       ', programId.toBase58());
  console.log('Mint:             ', mint.toBase58());
  console.log('vault_state PDA:  ', vaultState.toBase58(), '  seeds: ["state", mint]');
  console.log('vault_authority:  ', vaultAuthority.toBase58(), '  bump:', vaultBump, '  seeds: ["vault", mint]');
  console.log('vault_token (ATA):', vaultTokenAccount.toBase58(), '  (ATA of mint for vault_authority PDA)');
}

main();
