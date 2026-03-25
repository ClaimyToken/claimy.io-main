/**
 * Dynamic max stake vs on-chain SPL bankroll (payout / vault wallet ATA).
 *
 * Secrets: SOLANA_RPC_URL, CLAIMY_SPL_MINT, optional CLAIMY_SPL_DECIMALS,
 *          CLAIMY_BANKROLL_WALLET (base58 owner pubkey whose ATA holds house bankroll).
 * Optional: CLAIMY_MAX_STAKE_BANKROLL_RATIO (overrides DB default if set).
 *
 * DB: claimy_bankroll_settings.max_stake_bankroll_ratio (default 0.005 = 0.5%).
 *
 * Duplicated per Edge function folder — Supabase deploy bundles each function alone (no ../_shared).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Connection, PublicKey } from "npm:@solana/web3.js@1.95.4";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "npm:@solana/spl-token@0.4.9";

export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function loadRatio(supabase: SupabaseClient): Promise<number> {
  const env = Deno.env.get("CLAIMY_MAX_STAKE_BANKROLL_RATIO")?.trim();
  if (env) {
    const p = parseFloat(env);
    if (Number.isFinite(p) && p > 0 && p <= 1) return p;
  }
  try {
    const { data, error } = await supabase
      .from("claimy_bankroll_settings")
      .select("max_stake_bankroll_ratio")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data && data.max_stake_bankroll_ratio != null) {
      const r = Number(data.max_stake_bankroll_ratio);
      if (Number.isFinite(r) && r > 0 && r <= 1) return r;
    }
  } catch {
    /* table may not exist yet */
  }
  return 0.005;
}

function bankrollWalletConfigured(): boolean {
  return !!Deno.env.get("CLAIMY_BANKROLL_WALLET")?.trim();
}

async function readBankrollBalanceUi(): Promise<{ ok: true; balanceUi: number } | { ok: false; error: string }> {
  const rpc = Deno.env.get("SOLANA_RPC_URL")?.trim();
  const mintStr = Deno.env.get("CLAIMY_SPL_MINT")?.trim();
  const ownerStr = Deno.env.get("CLAIMY_BANKROLL_WALLET")?.trim();
  if (!rpc || !mintStr || !ownerStr) {
    return { ok: false, error: "Missing SOLANA_RPC_URL, CLAIMY_SPL_MINT, or CLAIMY_BANKROLL_WALLET." };
  }
  try {
    const connection = new Connection(rpc, "confirmed");
    const mint = new PublicKey(mintStr);
    const owner = new PublicKey(ownerStr);
    const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
    const bal = await connection.getTokenAccountBalance(ata);
    const ui = bal.value.uiAmount;
    if (typeof ui === "number" && Number.isFinite(ui)) {
      return { ok: true, balanceUi: Math.max(0, ui) };
    }
    const raw = BigInt(bal.value.amount);
    const dec = bal.value.decimals;
    const u = Number(raw) / 10 ** dec;
    return { ok: true, balanceUi: Number.isFinite(u) ? Math.max(0, u) : 0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/could not find account|not found|invalid account|could not find/i.test(msg)) {
      return { ok: true, balanceUi: 0 };
    }
    return { ok: false, error: msg };
  }
}

async function insertSnapshot(
  supabase: SupabaseClient,
  balanceUi: number,
  maxStakeUi: number,
  ratio: number,
): Promise<void> {
  try {
    await supabase.from("claimy_bankroll_snapshots").insert({
      balance_ui: balanceUi,
      max_stake_ui: maxStakeUi,
      ratio,
    });
  } catch {
    /* optional table */
  }
}

export type BankrollStakeCapOk = {
  ok: true;
  enforced: boolean;
  maxStake: number;
  bankrollBalanceUi: number;
  ratio: number;
};

export type BankrollStakeCapErr = {
  ok: false;
  error: string;
  maxStake?: number;
  bankrollBalanceUi?: number;
  ratio?: number;
};

/** Full cap info (for bankroll-info Edge + internal use). */
export async function getBankrollStakeCapInfo(
  supabase: SupabaseClient,
): Promise<BankrollStakeCapOk | BankrollStakeCapErr> {
  if (!bankrollWalletConfigured()) {
    return {
      ok: true,
      enforced: false,
      maxStake: Number.MAX_SAFE_INTEGER,
      bankrollBalanceUi: 0,
      ratio: 0,
    };
  }
  const ratio = await loadRatio(supabase);
  const bal = await readBankrollBalanceUi();
  if (!bal.ok) {
    return { ok: false, error: `Bankroll read failed: ${bal.error}` };
  }
  const maxStake = round6(Math.max(0, bal.balanceUi * ratio));
  return {
    ok: true,
    enforced: true,
    maxStake,
    bankrollBalanceUi: bal.balanceUi,
    ratio,
  };
}

/** Reject stake when over cap (when bankroll enforcement is on). */
export async function assertStakeWithinBankrollCap(
  supabase: SupabaseClient,
  stake: number,
): Promise<BankrollStakeCapOk | BankrollStakeCapErr> {
  const info = await getBankrollStakeCapInfo(supabase);
  if (!info.ok) {
    return info;
  }
  if (!info.enforced) {
    return info;
  }
  if (info.maxStake <= 0 && stake > 0) {
    return {
      ok: false,
      error:
        "House bankroll is empty (or ATA missing); staking is disabled until the bankroll wallet is funded.",
      maxStake: 0,
      bankrollBalanceUi: info.bankrollBalanceUi,
      ratio: info.ratio,
    };
  }
  if (stake > info.maxStake + 1e-9) {
    return {
      ok: false,
      error: `Max stake for this bankroll is ${info.maxStake.toFixed(6)} CLAIMY (${(info.ratio * 100).toFixed(2)}% × ${info.bankrollBalanceUi.toFixed(4)} SPL in bankroll wallet).`,
      maxStake: info.maxStake,
      bankrollBalanceUi: info.bankrollBalanceUi,
      ratio: info.ratio,
    };
  }
  void insertSnapshot(supabase, info.bankrollBalanceUi, info.maxStake, info.ratio);
  return info;
}
