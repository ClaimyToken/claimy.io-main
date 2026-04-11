/**
 * Supabase Edge Function: claimy-credits
 * Server-authoritative playable balance (Postgres) + optional mutations (shared secret).
 *
 * POST JSON:
 *   { "action": "get", "walletAddress": "<phantom pubkey>" }
 *   { "action": "apply_delta", "walletAddress", "delta": "<decimal string>", "entryType": "game_win", "ref": "optional" }
 *   { "action": "record_deposit", "walletAddress", "txSignature", "mint", "amount": "<decimal string>" }
 *   { "action": "sync_from_chain", "walletAddress": "<phantom pubkey>" } — credits **new** SPL on custodial deposit vs `deposit_chain_balance_snapshot` (not vs playable_balance; avoids undoing withdraws). If snapshot was never set and playable is ~0, treats baseline as 0 so tokens already on the deposit wallet credit on first sync.
 *   { "action": "list_ledger", "walletAddress", "direction": "all"|"incoming"|"outgoing", "limit": 50 } — credit ledger rows (deposits, withdraws, syncs, games)
 *
 * Mutations require: Authorization: Bearer <CLAIMY_CREDITS_MUTATION_SECRET>
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: CLAIMY_CREDITS_MUTATION_SECRET (if unset, only "get" works)
 * For sync_from_chain: SOLANA_RPC_URL, CLAIMY_SPL_MINT (same as withdraw-spl)
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function parsePositiveDecimal(s: string): number {
  const t = s.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error("INVALID_DECIMAL");
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_DECIMAL");
  return n;
}

function parseSignedDecimal(s: string): number {
  const t = s.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error("INVALID_DECIMAL");
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error("INVALID_DECIMAL");
  return n;
}

/** Same JSON-RPC as the Angular SplTokenBalanceService (deposit ATA + mint). */
async function getSplUiBalance(ownerBase58: string, mintBase58: string, rpcUrl: string): Promise<number> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [ownerBase58, { mint: mintBase58 }, { encoding: "jsonParsed" }],
  };
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json() as {
    error?: { message: string };
    result?: { value: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string; decimals: number; uiAmount: number | null } } } } } }> };
  };
  if (j.error?.message) throw new Error(j.error.message);
  const list = j.result?.value ?? [];
  if (list.length === 0) return 0;
  const ta = list[0].account.data.parsed.info.tokenAmount;
  if (typeof ta.uiAmount === "number" && Number.isFinite(ta.uiAmount)) return ta.uiAmount;
  const raw = BigInt(ta.amount);
  const d = ta.decimals;
  return Number(raw) / Math.pow(10, d);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return json({ ok: false, error: "Server misconfigured." }, 500);
  }

  const supabase = createClient(url, key);
  const body = await req.json().catch(() => ({}));
  const action = (body.action ?? "").toString().trim();
  const walletAddress = (body.walletAddress ?? "").toString().trim();

  const mutationSecret = (Deno.env.get("CLAIMY_CREDITS_MUTATION_SECRET") ?? "").trim();
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const canMutate = mutationSecret.length > 0 && bearer === mutationSecret;

  if (action === "get") {
    if (!walletAddress) {
      return json({ ok: false, error: "walletAddress required." }, 400);
    }
    const { data, error } = await supabase.rpc("claimy_get_playable_balance", {
      p_wallet: walletAddress,
    });
    if (error) {
      const msg = error.message ?? String(error);
      if (msg.includes("USER_NOT_FOUND")) {
        return json({ ok: false, error: "Account not found." }, 200);
      }
      return json(
        {
          ok: false,
          error: msg,
          hint: "Run docs/migrations/claimy_playable_credits.sql if RPC is missing.",
        },
        200,
      );
    }
    const raw = data as unknown;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    const playableBalance = Number.isFinite(n) ? n : 0;
    return json({ ok: true, playableBalance, source: "database" });
  }

  if (action === "apply_delta") {
    if (!canMutate) {
      return json({ ok: false, error: "Mutations require Authorization: Bearer <CLAIMY_CREDITS_MUTATION_SECRET>." }, 401);
    }
    if (!walletAddress) {
      return json({ ok: false, error: "walletAddress required." }, 400);
    }
    const deltaStr = (body.delta ?? "").toString();
    const entryType = (body.entryType ?? "adjustment").toString().trim() || "adjustment";
    const ref = body.ref != null ? String(body.ref).slice(0, 512) : null;
    let delta: number;
    try {
      delta = parseSignedDecimal(deltaStr);
    } catch {
      return json({ ok: false, error: "delta must be a decimal string (e.g. -10 or 5.5)." }, 400);
    }
    const { data, error } = await supabase.rpc("claimy_apply_credit_delta", {
      p_wallet: walletAddress,
      p_delta: delta,
      p_entry_type: entryType,
      p_ref: ref,
    });
    if (error) {
      const msg = error.message ?? String(error);
      if (msg.includes("INSUFFICIENT_BALANCE")) {
        return json({ ok: false, error: "Insufficient playable balance." }, 200);
      }
      if (msg.includes("USER_NOT_FOUND")) {
        return json({ ok: false, error: "Account not found." }, 200);
      }
      return json({ ok: false, error: msg }, 200);
    }
    const raw = data as unknown;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return json({ ok: true, playableBalance: Number.isFinite(n) ? n : 0 });
  }

  if (action === "record_deposit") {
    if (!canMutate) {
      return json({ ok: false, error: "Mutations require Authorization: Bearer <CLAIMY_CREDITS_MUTATION_SECRET>." }, 401);
    }
    if (!walletAddress) {
      return json({ ok: false, error: "walletAddress required." }, 400);
    }
    const txSignature = (body.txSignature ?? "").toString().trim();
    const mint = (body.mint ?? "").toString().trim();
    const amountStr = (body.amount ?? "").toString();
    if (!txSignature || !mint) {
      return json({ ok: false, error: "txSignature and mint required." }, 400);
    }
    let amount: number;
    try {
      amount = parsePositiveDecimal(amountStr);
    } catch {
      return json({ ok: false, error: "amount must be a positive decimal string." }, 400);
    }
    const { data, error } = await supabase.rpc("claimy_record_deposit", {
      p_wallet: walletAddress,
      p_tx_sig: txSignature,
      p_mint: mint,
      p_amount: amount,
    });
    if (error) {
      const msg = error.message ?? String(error);
      if (msg.includes("USER_NOT_FOUND")) {
        return json({ ok: false, error: "Account not found." }, 200);
      }
      return json({ ok: false, error: msg }, 200);
    }
    const raw = data as unknown;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return json({ ok: true, playableBalance: Number.isFinite(n) ? n : 0, idempotent: false });
  }

  /**
   * Credit **new** SPL arriving at the custodial deposit ATA, without re-crediting when
   * `playable_balance` < on-chain deposit (e.g. after **withdraw** debited from DB only).
   * Uses `deposit_chain_balance_snapshot` (run migration `claimy_deposit_chain_snapshot.sql`).
   */
  if (action === "sync_from_chain") {
    if (!walletAddress) {
      return json({ ok: false, error: "walletAddress required." }, 400);
    }
    const rpcUrl = (Deno.env.get("SOLANA_RPC_URL") ?? "").trim();
    const mintStr = (Deno.env.get("CLAIMY_SPL_MINT") ?? "").trim();
    if (!rpcUrl || !mintStr) {
      return json(
        {
          ok: false,
          error: "Server missing SOLANA_RPC_URL or CLAIMY_SPL_MINT (set Edge secrets, same as withdraw-spl).",
        },
        200,
      );
    }

    const { data: row, error: rowErr } = await supabase
      .from("claimy_users")
      .select("deposit_wallet_public_key")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (rowErr || !row?.deposit_wallet_public_key?.trim()) {
      return json({ ok: false, error: "No custodial deposit address on this account." }, 200);
    }

    const depositPk = row.deposit_wallet_public_key.trim();

    let onchain: number;
    try {
      onchain = await getSplUiBalance(depositPk, mintStr, rpcUrl);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: `RPC balance failed: ${m}` }, 200);
    }

    /** Single locked transaction in Postgres — prevents double-credit when two syncs run at once (nav + modal). */
    const { data: rpcRaw, error: rpcErr } = await supabase.rpc("claimy_sync_from_chain_apply", {
      p_wallet: walletAddress,
      p_onchain: onchain,
    });

    if (rpcErr) {
      const msg = rpcErr.message ?? String(rpcErr);
      if (
        msg.includes("claimy_sync_from_chain_apply") ||
        (msg.includes("function") && msg.includes("does not exist"))
      ) {
        return json(
          {
            ok: false,
            error:
              "Run docs/migrations/claimy_sync_from_chain_atomic.sql in Supabase SQL Editor, then retry.",
          },
          200,
        );
      }
      return json({ ok: false, error: msg }, 200);
    }

    const out = rpcRaw as Record<string, unknown> | null;
    if (!out || typeof out !== "object") {
      return json({ ok: false, error: "Invalid sync response." }, 200);
    }
    if (out["ok"] === false) {
      const err = typeof out["error"] === "string" ? out["error"] : "Sync failed.";
      if (err.includes("INSUFFICIENT_BALANCE_RECONCILE")) {
        return json(
          {
            ok: false,
            error:
              "Could not reconcile (on-chain deposit dropped but credits would go negative). Investigate custodial wallet.",
            onchainBalance: out["onchainBalance"],
            playableBalanceBefore: out["playableBalanceBefore"],
            snapshotBefore: out["snapshotBefore"],
          },
          200,
        );
      }
      if (err === "USER_NOT_FOUND") {
        return json({ ok: false, error: "Account not found." }, 200);
      }
      return json({ ok: false, error: err }, 200);
    }

    const pb = out["playableBalance"];
    const n = typeof pb === "number" ? pb : parseFloat(String(pb));
    return json({
      ok: true,
      playableBalance: Number.isFinite(n) ? n : 0,
      synced: out["synced"] === true,
      deltaApplied: typeof out["deltaApplied"] === "number" ? out["deltaApplied"] : undefined,
      onchainBalance: typeof out["onchainBalance"] === "number" ? out["onchainBalance"] : onchain,
      baselineSnapshot: out["baselineSnapshot"] === true,
      source: "database",
    });
  }

  if (action === "list_ledger") {
    if (!walletAddress) {
      return json({ ok: false, error: "walletAddress required." }, 400);
    }
    const direction = (body.direction ?? "all").toString().trim().toLowerCase();
    const limitRaw = Number(body.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

    const { data: userRow, error: uErr } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (uErr) {
      return json({ ok: false, error: uErr.message ?? String(uErr) }, 200);
    }
    if (!userRow?.id) {
      return json({ ok: false, error: "Account not found." }, 200);
    }

    let q = supabase
      .from("claimy_credit_ledger")
      .select("id, entry_type, amount_delta, balance_after, ref, metadata, created_at")
      .eq("user_id", userRow.id);

    if (direction === "incoming") {
      q = q.gt("amount_delta", 0);
    } else if (direction === "outgoing") {
      q = q.lt("amount_delta", 0);
    } else if (direction !== "all") {
      return json({ ok: false, error: "direction must be all, incoming, or outgoing." }, 400);
    }

    const { data: rows, error: lErr } = await q.order("created_at", { ascending: false }).limit(limit);
    if (lErr) {
      return json({ ok: false, error: lErr.message ?? String(lErr) }, 200);
    }
    return json({ ok: true, entries: rows ?? [] });
  }

  return json(
    {
      ok: false,
      error: "Unknown action. Use: get | sync_from_chain | apply_delta | record_deposit | list_ledger",
    },
    400,
  );
});
