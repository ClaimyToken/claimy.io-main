import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bs58 from "npm:bs58@5.0.0";
import { Connection, Keypair, PublicKey, Transaction } from "npm:@solana/web3.js@1.95.4";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "npm:@solana/spl-token@0.4.9";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function parseAdminWallets(): string[] {
  return (Deno.env.get("CLAIMY_ADMIN_WALLETS") ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

function loadKeypair(raw: string): Keypair {
  const t = raw.trim();
  if (t.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(t)));
  return Keypair.fromSecretKey(bs58.decode(t));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").trim();
  if (clean.length !== 64) throw new Error("DEPOSIT_WALLET_ENCRYPTION_KEY must be 64 hex chars.");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptSecretKey(encryptedB64: string, aesKey32: Uint8Array): Promise<Uint8Array> {
  const combined = b64ToBytes(encryptedB64);
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const key = await crypto.subtle.importKey("raw", aesKey32 as BufferSource, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new Uint8Array(plain);
}

type Candidate = {
  userId: string;
  userWalletAddress: string;
  depositWalletAddress: string;
  sourceAta: string;
  destinationAta: string;
  rawAmount: bigint;
  uiAmount: number;
  encryptedSecret: string;
};

type DebugLine = {
  t: string;
  msg: string;
  data?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "Server misconfigured." }, 500);
  const supabase = createClient(url, key);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const walletAddress = String(body.walletAddress ?? "").trim();
  const debug = body.debug === true;
  const debugLines: DebugLine[] = [];
  const logDebug = (msg: string, data?: Record<string, unknown>) => {
    if (!debug) return;
    debugLines.push({ t: new Date().toISOString(), msg, data });
  };
  if (!walletAddress) return json({ ok: false, error: "walletAddress required." }, 400);

  const isAdmin = parseAdminWallets().some((w) => w === walletAddress);
  if (!isAdmin) return json({ ok: false, error: "Not authorized." }, 403);
  if (action === "admin_whoami") return json({ ok: true, isAdmin: true });
  if (action !== "dry_run" && action !== "execute" && action !== "summary_only") {
    return json({ ok: false, error: "Unknown action. Use: admin_whoami | summary_only | dry_run | execute" }, 400);
  }

  const mintStr = (Deno.env.get("CLAIMY_SPL_MINT") ?? "").trim();
  const rpcUrl = (Deno.env.get("SOLANA_RPC_URL") ?? "").trim();
  const encKeyHex = (Deno.env.get("DEPOSIT_WALLET_ENCRYPTION_KEY") ?? "").trim();
  const feePayerSecret = (Deno.env.get("CLAIMY_SWEEP_FEE_PAYER_PRIVATE_KEY") ?? "").trim();
  const destinationWallet = String(body.destinationWallet ?? "").trim() ||
    (Deno.env.get("CLAIMY_SWEEP_DESTINATION_WALLET") ?? "").trim() || walletAddress;
  const maxWalletsRaw = parseInt(String(body.maxWallets ?? "150"), 10);
  const maxWallets = Number.isFinite(maxWalletsRaw) ? Math.min(500, Math.max(1, maxWalletsRaw)) : 150;
  const scanAll = body.scanAll === true;
  logDebug("request_received", {
    action,
    walletAddress,
    destinationWallet,
    maxWallets,
    scanAll,
    hasDestinationOverride: String(body.destinationWallet ?? "").trim().length > 0,
  });

  if (!mintStr || !rpcUrl) {
    return json({ ok: false, error: "Missing CLAIMY_SPL_MINT or SOLANA_RPC_URL." }, 500);
  }
  if (action !== "summary_only" && !encKeyHex) {
    return json({ ok: false, error: "Missing DEPOSIT_WALLET_ENCRYPTION_KEY." }, 500);
  }
  if (action === "execute" && !feePayerSecret) {
    return json({ ok: false, error: "Missing CLAIMY_SWEEP_FEE_PAYER_PRIVATE_KEY." }, 500);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const mintPk = new PublicKey(mintStr);
  const destinationPk = new PublicKey(destinationWallet);
  const mintInfo = await connection.getAccountInfo(mintPk);
  if (!mintInfo) return json({ ok: false, error: "Mint not found on configured RPC." }, 500);
  const tokenProgramId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const mintMeta = await getMint(connection, mintPk, undefined, tokenProgramId);
  const decimals = mintMeta.decimals;
  const destinationAta = getAssociatedTokenAddressSync(mintPk, destinationPk, false, tokenProgramId).toBase58();
  logDebug("destination_resolved", { destinationWallet, destinationAta });

  let runId: string | null = null;
  if (action !== "summary_only") {
    const { data: runRow, error: runErr } = await supabase.from("claimy_admin_sweep_runs").insert({
      requested_by_wallet: walletAddress,
      mode: action === "execute" ? "execute" : "dry_run",
      destination_wallet: destinationWallet,
      status: "started",
    }).select("id").single();
    if (runErr || !runRow?.id) return json({ ok: false, error: runErr?.message ?? "Failed to create run." }, 500);
    runId = runRow.id as string;
    logDebug("run_opened", { runId, mode: action });
  }

  try {
    const users: Record<string, unknown>[] = [];
    const pageSize = 500;
    let from = 0;
    while (true) {
      const to = scanAll ? from + pageSize - 1 : Math.min(from + pageSize - 1, maxWallets - 1);
      if (!scanAll && from >= maxWallets) break;
      const { data: pageRows, error: usersErr } = await supabase
        .from("claimy_users")
        .select("id, wallet_address, deposit_wallet_public_key, deposit_wallet_private_key_encrypted")
        .not("deposit_wallet_public_key", "is", null)
        .not("deposit_wallet_private_key_encrypted", "is", null)
        .range(from, to);
      if (usersErr) throw new Error(usersErr.message ?? String(usersErr));
      const rows = (pageRows ?? []) as Record<string, unknown>[];
      users.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    logDebug("users_scanned", { count: users.length });

    const candidates: Candidate[] = [];
    for (const row of users) {
      const userId = String((row as Record<string, unknown>)["id"] ?? "").trim();
      const userWallet = String((row as Record<string, unknown>)["wallet_address"] ?? "").trim();
      const depWallet = String((row as Record<string, unknown>)["deposit_wallet_public_key"] ?? "").trim();
      const enc = String((row as Record<string, unknown>)["deposit_wallet_private_key_encrypted"] ?? "").trim();
      if (!userId || !userWallet || !depWallet || !enc) continue;
      let depPk: PublicKey;
      try {
        depPk = new PublicKey(depWallet);
      } catch {
        continue;
      }
      const sourceAtaPk = getAssociatedTokenAddressSync(mintPk, depPk, false, tokenProgramId);
      try {
        const acct = await getAccount(connection, sourceAtaPk, undefined, tokenProgramId);
        if (acct.amount <= 0n) continue;
        const uiAmount = Number(acct.amount) / Math.pow(10, decimals);
        candidates.push({
          userId,
          userWalletAddress: userWallet,
          depositWalletAddress: depWallet,
          sourceAta: sourceAtaPk.toBase58(),
          destinationAta,
          rawAmount: acct.amount,
          uiAmount: Number.isFinite(uiAmount) ? uiAmount : 0,
          encryptedSecret: enc,
        });
      } catch {
        // Missing ATA or bad account: skip.
      }
    }

    const sortedCandidates = [...candidates].sort((a, b) => {
      if (a.rawAmount === b.rawAmount) return 0;
      return a.rawAmount > b.rawAmount ? -1 : 1;
    });
    const selectedCandidates = sortedCandidates.slice(0, maxWallets);
    logDebug("holders_selected", {
      allWithBalance: sortedCandidates.length,
      selected: selectedCandidates.length,
      topHoldersLimit: maxWallets,
      preview: selectedCandidates.slice(0, 15).map((c) => ({
        depositWalletAddress: c.depositWalletAddress,
        sourceAta: c.sourceAta,
        uiAmount: c.uiAmount,
      })),
    });

    if (action !== "summary_only" && selectedCandidates.length > 0 && runId) {
      await supabase.from("claimy_admin_sweep_items").insert(selectedCandidates.map((c) => ({
        run_id: runId,
        user_id: c.userId,
        user_wallet_address: c.userWalletAddress,
        deposit_wallet_address: c.depositWalletAddress,
        source_ata: c.sourceAta,
        destination_ata: c.destinationAta,
        raw_amount: c.rawAmount.toString(),
        ui_amount: c.uiAmount,
        status: "pending",
      })));
    }

    let swept = 0;
    let failed = 0;
    if (action === "execute" && selectedCandidates.length > 0 && runId) {
      const aesKey = hexToBytes(encKeyHex);
      const feePayer = loadKeypair(feePayerSecret);
      for (const c of selectedCandidates) {
        try {
          logDebug("transfer_start", {
            depositWalletAddress: c.depositWalletAddress,
            sourceAta: c.sourceAta,
            destinationAta: c.destinationAta,
            uiAmount: c.uiAmount,
          });
          const depSecret = await decryptSecretKey(c.encryptedSecret, aesKey);
          const depKp = Keypair.fromSecretKey(depSecret);
          const sourceAtaPk = new PublicKey(c.sourceAta);
          const destinationAtaPk = new PublicKey(c.destinationAta);
          const ix = createTransferInstruction(
            sourceAtaPk,
            destinationAtaPk,
            depKp.publicKey,
            c.rawAmount,
            [],
            tokenProgramId,
          );
          const { blockhash } = await connection.getLatestBlockhash("confirmed");
          const tx = new Transaction({ feePayer: feePayer.publicKey, recentBlockhash: blockhash }).add(ix);
          tx.sign(feePayer, depKp);
          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
          await connection.confirmTransaction(sig, "confirmed");
          let remainingUi = 0;
          try {
            const afterAcct = await getAccount(connection, sourceAtaPk, undefined, tokenProgramId);
            remainingUi = Number(afterAcct.amount) / Math.pow(10, decimals);
          } catch {
            remainingUi = 0;
          }
          await supabase
            .from("claimy_users")
            .update({ deposit_chain_balance_snapshot: remainingUi })
            .eq("id", c.userId);
          swept++;
          logDebug("transfer_ok", {
            depositWalletAddress: c.depositWalletAddress,
            signature: sig,
            remainingUiAfterSweep: remainingUi,
          });
          await supabase.from("claimy_admin_sweep_items").update({
            status: "swept",
            tx_signature: sig,
            error_text: null,
          }).eq("run_id", runId).eq("deposit_wallet_address", c.depositWalletAddress);
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          logDebug("transfer_failed", {
            depositWalletAddress: c.depositWalletAddress,
            error: msg,
          });
          await supabase.from("claimy_admin_sweep_items").update({
            status: "failed",
            error_text: msg.slice(0, 1000),
          }).eq("run_id", runId).eq("deposit_wallet_address", c.depositWalletAddress);
        }
      }
    }

    const totalRaw = selectedCandidates.reduce((n, c) => n + c.rawAmount, 0n);
    const totalUi = selectedCandidates.reduce((n, c) => n + c.uiAmount, 0);
    logDebug("run_summary", {
      mode: action,
      scanned: users.length,
      allWithBalance: sortedCandidates.length,
      selected: selectedCandidates.length,
      totalUi,
      destinationWallet,
      destinationAta,
      swept,
      failed,
    });
    if (runId) {
      await supabase.from("claimy_admin_sweep_runs").update({
        status: "completed",
        wallets_scanned: users.length,
        wallets_with_balance: selectedCandidates.length,
        total_raw_amount: totalRaw.toString(),
        total_ui_amount: totalUi,
        notes: action === "execute" ? `swept=${swept}, failed=${failed}` : "dry run complete",
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return json({
      ok: true,
      mode: action,
      runId,
      destinationWallet,
      destinationAta,
      walletsScanned: users.length,
      walletsWithBalance: selectedCandidates.length,
      walletsWithBalanceAll: sortedCandidates.length,
      topHoldersLimit: maxWallets,
      totalRawAmount: totalRaw.toString(),
      totalUiAmount: totalUi,
      scanAll,
      swept,
      failed,
      items: selectedCandidates.map((c) => ({
        depositWalletAddress: c.depositWalletAddress,
        sourceAta: c.sourceAta,
        rawAmount: c.rawAmount.toString(),
        uiAmount: c.uiAmount,
      })),
      debug: debug ? debugLines : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logDebug("run_failed", { error: msg });
    if (runId) {
      await supabase.from("claimy_admin_sweep_runs").update({
        status: "failed",
        notes: msg.slice(0, 1000),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return json({ ok: false, error: msg, runId, debug: debug ? debugLines : undefined }, 500);
  }
});
