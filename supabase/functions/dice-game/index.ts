/**
 * Claimy Dice — provably fair roll in [0, 999] (1000 outcomes). HMAC label `claimy-dice|v2|…`.
 * game_key = "dice". One-shot settle per request (`roll` action).
 *
 * Modes: `under` (win if roll < target), `over` (win if roll > target).
 * Target ranges enforce ~2%–98% win chance before house edge.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HOUSE_EDGE = 0.01;
const MAX_MULTIPLIER = 500;
/** 1000 outcomes (0..999); ~2% min win = 20 outcomes, ~98% max = 980 outcomes. */
const OUTCOME_SPACE = 1000;
const MIN_WIN_OUTCOMES = 20;
const MAX_WIN_OUTCOMES = 980;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function parsePositiveDecimal(input: unknown): number {
  const s = String(input ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("INVALID_AMOUNT");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_AMOUNT");
  return n;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexString(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function deriveUint32(serverSecret: Uint8Array, clientSeed: string, counter: number): Promise<number> {
  const msg = `claimy-dice|v2|${clientSeed}|${counter}`;
  const h = await hmacSha256(serverSecret, msg);
  const view = new DataView(h.buffer);
  return view.getUint32(0, false) >>> 0;
}

function randomHex(len: number): string {
  const bytes = randomBytes(Math.ceil(len / 2));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, len);
}

async function buildFairSnapshot(
  serverSeedHashHex: string,
  clientSeed: string,
  roll: number,
  mode: string,
  target: number,
  includeReveal: boolean,
  serverSeedSecretB64: string,
): Promise<Record<string, unknown>> {
  const rollDigest = await sha256HexString(`${roll}|${mode}|${target}|${clientSeed}`);
  return {
    serverSeedHash: serverSeedHashHex,
    clientSeed,
    nonce: 0,
    rollSpace: OUTCOME_SPACE,
    roll,
    mode,
    target,
    rollDigest,
    serverSeedReveal: includeReveal ? serverSeedSecretB64 : "",
  };
}

function parseMode(raw: unknown): "under" | "over" | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "under" || s === "over") return s;
  return null;
}

function winCountFor(mode: "under" | "over", target: number): number | null {
  if (mode === "under") {
    if (!Number.isInteger(target) || target < MIN_WIN_OUTCOMES || target > MAX_WIN_OUTCOMES) return null;
    return target;
  }
  if (!Number.isInteger(target) || target < 19 || target > 979) return null;
  const wc = 999 - target;
  if (wc < MIN_WIN_OUTCOMES || wc > MAX_WIN_OUTCOMES) return null;
  return wc;
}

function payoutMultiplier(winCount: number): number {
  const fair = OUTCOME_SPACE / winCount;
  const m = fair * (1 - HOUSE_EDGE);
  return round6(Math.min(MAX_MULTIPLIER, m));
}

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
  if (!walletAddress) return json({ ok: false, error: "walletAddress required." }, 400);

  if (action !== "roll") {
    return json({ ok: false, error: "Unknown action. Use: roll" }, 400);
  }

  let stake: number;
  try {
    stake = parsePositiveDecimal(body.betAmount);
  } catch {
    return json({ ok: false, error: "betAmount must be a positive decimal string." }, 400);
  }

  const mode = parseMode(body.mode);
  if (!mode) return json({ ok: false, error: "mode must be under or over." }, 400);

  const targetRaw = body.target;
  const target = typeof targetRaw === "number" ? targetRaw : parseInt(String(targetRaw ?? ""), 10);
  const winCount = winCountFor(mode, target);
  if (winCount == null) {
    return json({
      ok: false,
      error: mode === "under"
        ? `target must be an integer ${MIN_WIN_OUTCOMES}–${MAX_WIN_OUTCOMES} for roll-under.`
        : `target must be an integer 19–979 for roll-over (win window ${MIN_WIN_OUTCOMES}–${MAX_WIN_OUTCOMES}).`,
    }, 200);
  }

  const mult = payoutMultiplier(winCount);

  const { data: userRow, error: userErr } = await supabase
    .from("claimy_users")
    .select("id, games_client_seed")
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  if (userErr || !userRow?.id) return json({ ok: false, error: "Account not found." }, 200);

  const { data: afterDebitRaw, error: debitErr } = await supabase.rpc("claimy_apply_credit_delta", {
    p_wallet: walletAddress,
    p_delta: -stake,
    p_entry_type: "game_bet_locked",
    p_ref: "dice",
  });
  if (debitErr) {
    const msg = debitErr.message ?? String(debitErr);
    if (msg.includes("INSUFFICIENT_BALANCE")) {
      return json({ ok: false, error: "Insufficient playable balance." }, 200);
    }
    return json({ ok: false, error: msg }, 200);
  }

  const afterDebit = typeof afterDebitRaw === "number" ? afterDebitRaw : parseFloat(String(afterDebitRaw));
  const balanceAfterDebit = Number.isFinite(afterDebit) ? afterDebit : 0;
  const balanceBefore = balanceAfterDebit + stake;

  const serverSeedSecret = randomBytes(32);
  const serverSeedSecretB64 = bytesToBase64(serverSeedSecret);
  const serverSeedHashHex = await sha256Hex(serverSeedSecret);

  let clientSeed = String(body.clientSeed ?? "").trim();
  if (!clientSeed) {
    const g = userRow?.games_client_seed;
    clientSeed = typeof g === "string" ? g.trim() : "";
  }
  if (!clientSeed) clientSeed = randomHex(24);
  if (clientSeed.length > 128) clientSeed = clientSeed.slice(0, 128);

  const u32 = await deriveUint32(serverSeedSecret, clientSeed, 0);
  const roll = u32 % OUTCOME_SPACE;

  const won = mode === "under" ? roll < target : roll > target;
  const payout = won ? round6(stake * mult) : 0;
  const winner: "Player" | "House" = won ? "Player" : "House";

  const playerHand = mode === "under" ? `Roll under ${target}` : `Roll over ${target}`;
  const houseHand = `Roll ${roll}`;

  const preMeta: Record<string, unknown> = {
    status: "in_progress",
    stakeAmount: stake,
    mode,
    target,
    winCount,
    multiplier: mult,
    roll,
    pendingWinner: winner,
    clientSeed,
    serverSeedHash: serverSeedHashHex,
    serverSeedSecretB64,
    startedAt: new Date().toISOString(),
  };

  const { data: gameRow, error: gameErr } = await supabase
    .from("claimy_game_sessions")
    .insert({
      user_id: userRow.id,
      game_key: "dice",
      balance_before: balanceBefore,
      balance_after: balanceAfterDebit,
      delta: -stake,
      metadata: preMeta,
    })
    .select("id, user_id, balance_before")
    .single();

  if (gameErr || !gameRow?.id) {
    await supabase.rpc("claimy_apply_credit_delta", {
      p_wallet: walletAddress,
      p_delta: stake,
      p_entry_type: "game_bet_refund",
      p_ref: "dice_start_failed",
    });
    return json({ ok: false, error: "Could not create game session." }, 200);
  }

  const gid = gameRow.id as string;
  const uid = gameRow.user_id as string;
  const balanceBeforeRow =
    typeof gameRow.balance_before === "number"
      ? gameRow.balance_before
      : parseFloat(String(gameRow.balance_before));

  let balanceAfter = balanceAfterDebit;
  if (payout > 0) {
    const { data: afterCreditRaw, error: creditErr } = await supabase.rpc("claimy_apply_credit_delta", {
      p_wallet: walletAddress,
      p_delta: payout,
      p_entry_type: "game_win_payout",
      p_ref: gid,
    });
    if (creditErr) {
      await supabase.rpc("claimy_apply_credit_delta", {
        p_wallet: walletAddress,
        p_delta: stake,
        p_entry_type: "game_bet_refund",
        p_ref: "dice_payout_fail",
      });
      await supabase
        .from("claimy_game_sessions")
        .update({
          metadata: {
            ...preMeta,
            status: "failed",
            failReason: creditErr.message ?? String(creditErr),
          },
        })
        .eq("id", gid)
        .eq("user_id", uid);
      return json({ ok: false, error: creditErr.message ?? "Payout failed." }, 200);
    }
    const n = typeof afterCreditRaw === "number" ? afterCreditRaw : parseFloat(String(afterCreditRaw));
    balanceAfter = Number.isFinite(n) ? n : balanceAfterDebit;
  } else {
    const { data: balRaw, error: balErr } = await supabase.rpc("claimy_get_playable_balance", {
      p_wallet: walletAddress,
    });
    if (balErr) {
      return json({ ok: false, error: balErr.message ?? String(balErr) }, 200);
    }
    const n = typeof balRaw === "number" ? balRaw : parseFloat(String(balRaw));
    balanceAfter = Number.isFinite(n) ? n : balanceAfterDebit;
  }

  const fairSnapshot = await buildFairSnapshot(
    serverSeedHashHex,
    clientSeed,
    roll,
    mode,
    target,
    true,
    serverSeedSecretB64,
  );

  const settledMeta: Record<string, unknown> = {
    status: "settled",
    stakeAmount: stake,
    settledAt: new Date().toISOString(),
    winner,
    payoutAmount: payout,
    playerHand,
    houseHand,
    mode,
    target,
    winCount,
    multiplier: mult,
    roll,
    houseEdge: HOUSE_EDGE,
    clientSeed,
    serverSeedHash: serverSeedHashHex,
    fairSnapshot,
    finalRound: {
      player: [playerHand],
      house: [houseHand],
    },
    serverSeedRevealedAt: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from("claimy_game_sessions")
    .update({
      balance_after: balanceAfter,
      delta: Number.isFinite(balanceBeforeRow) ? balanceAfter - balanceBeforeRow : -stake + payout,
      metadata: settledMeta,
    })
    .eq("id", gid)
    .eq("user_id", uid);

  if (updErr) {
    return json({ ok: false, error: updErr.message ?? "Could not finalize session." }, 200);
  }

  return json({
    ok: true,
    settled: true,
    gameId: gid,
    winner,
    payoutAmount: payout,
    playableBalance: balanceAfter,
    roll,
    mode,
    target,
    multiplier: mult,
    winCount,
    playerHand,
    houseHand,
    fairSnapshot,
  });
});
