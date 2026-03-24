/**
 * CLI: same SPL balance the app uses for "Claimy Credits" (deposit wallet + mint via RPC).
 *
 * Usage:
 *   node scripts/check-deposit-balance.cjs <deposit_wallet_public_key>
 *   node scripts/check-deposit-balance.cjs --mint <MINT> --rpc <RPC_URL> <deposit_wallet_public_key>
 *
 * Loads .env / claimy.env from repo root (CLAIMY_SOLANA_RPC_URL, CLAIMY_SPL_MINT) unless --mint/--rpc override.
 */
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');

function resolveEnvFile() {
  for (const name of ['.env', 'claimy.env']) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const envPath = resolveEnvFile();
if (envPath) {
  require('dotenv').config({ path: envPath });
}

function parseArgs(argv) {
  let rpc = (process.env.CLAIMY_SOLANA_RPC_URL || '').trim();
  let mint = (process.env.CLAIMY_SPL_MINT || '').trim();
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rpc') {
      rpc = (argv[++i] || '').trim();
      continue;
    }
    if (a === '--mint') {
      mint = (argv[++i] || '').trim();
      continue;
    }
    if (a === '--help' || a === '-h') {
      return { help: true };
    }
    if (!a.startsWith('-')) positional.push(a);
  }
  return { rpc, mint, owner: positional[0] || '' };
}

async function getSplUiAmount(ownerBase58, mintBase58, rpcUrl) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenAccountsByOwner',
    params: [ownerBase58, { mint: mintBase58 }, { encoding: 'jsonParsed' }],
  };
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  const list = json.result?.value ?? [];
  if (list.length === 0) {
    return { ui: 0, raw: '0', decimals: 0 };
  }
  const ta = list[0].account.data.parsed.info.tokenAmount;
  const decimals = ta.decimals;
  const raw = BigInt(ta.amount);
  let ui;
  if (typeof ta.uiAmount === 'number' && Number.isFinite(ta.uiAmount)) {
    ui = ta.uiAmount;
  } else {
    ui = Number(raw) / Math.pow(10, decimals);
  }
  return { ui, raw: ta.amount, decimals };
}

async function main() {
  const p = parseArgs(process.argv.slice(2));
  if (p.help) {
    console.log(`Usage:
  node scripts/check-deposit-balance.cjs <deposit_wallet_public_key>
  node scripts/check-deposit-balance.cjs --mint <MINT> --rpc <RPC_URL> <deposit_wallet_public_key>

Uses CLAIMY_SOLANA_RPC_URL and CLAIMY_SPL_MINT from .env (or claimy.env) unless --rpc / --mint are set.
Same RPC method as the Angular app (getTokenAccountsByOwner, jsonParsed).`);
    process.exit(0);
  }

  const { owner, rpc, mint } = p;
  if (!owner) {
    console.error('Error: pass the custodial deposit wallet address (base58) as the first argument.');
    console.error('Example: node scripts/check-deposit-balance.cjs YourDepositWalletPubkeyHere');
    process.exit(1);
  }
  if (!rpc) {
    console.error('Error: set CLAIMY_SOLANA_RPC_URL in .env or pass --rpc <url>');
    process.exit(1);
  }
  if (!mint) {
    console.error('Error: set CLAIMY_SPL_MINT in .env or pass --mint <address>');
    process.exit(1);
  }

  console.log('RPC:   ', rpc.replace(/\?.*$/, '?…'));
  console.log('Mint:  ', mint);
  console.log('Owner: ', owner);
  console.log('');

  try {
    const { ui, raw, decimals } = await getSplUiAmount(owner, mint, rpc);
    console.log('Token balance (human / UI amount):', ui);
    console.log('Raw amount (base units):            ', raw, `(decimals=${decimals})`);
    if (ui === 0 && raw === '0') {
      console.log('');
      console.log('(No token account for this mint, or zero balance. Send Claimy SPL to this address from Phantom, then run again.)');
    }
  } catch (e) {
    console.error('RPC error:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
