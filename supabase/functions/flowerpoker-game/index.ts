import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

type GameSessionRow = {
  id: string;
  user_id: string;
  game_key: string;
  balance_before: number | string;
  metadata: Record<string, unknown> | null;
};

/** Same weights as Angular `FLOWERS`. */
const FLOWER_IDS = [
  "mixed",
  "red",
  "yellow",
  "blue",
  "orange",
  "purple",
  "assorted",
  "black",
  "white",
] as const;
const FLOWER_WEIGHTS = [150, 150, 150, 150, 150, 148, 100, 2, 1];
const TOTAL_WEIGHT = FLOWER_WEIGHTS.reduce((a, b) => a + b, 0);

type HandRankKey =
  | "bust"
  | "one_pair"
  | "two_pair"
  | "three_kind"
  | "full_house"
  | "four_kind"
  | "five_kind";

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

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
  const msg = `claimy-fp|v1|${clientSeed}|${counter}`;
  const h = await hmacSha256(serverSecret, msg);
  const view = new DataView(h.buffer);
  return view.getUint32(0, false) >>> 0;
}

function pickFlower(u32: number): string {
  const x = (u32 / 0x1_0000_0000) * TOTAL_WEIGHT;
  let t = x;
  for (let i = 0; i < FLOWER_IDS.length; i++) {
    const w = FLOWER_WEIGHTS[i]!;
    if (t < w) return FLOWER_IDS[i]!;
    t -= w;
  }
  return FLOWER_IDS[0]!;
}

async function generateFullRound(
  serverSecret: Uint8Array,
  clientSeed: string,
  subRoundIndex: number,
): Promise<{ player: string[]; house: string[] }> {
  const base = subRoundIndex * 40;
  const player: string[] = [];
  const house: string[] = [];
  for (let i = 0; i < 5; i++) {
    const u = await deriveUint32(serverSecret, clientSeed, base + i);
    player.push(pickFlower(u));
  }
  for (let i = 0; i < 5; i++) {
    const u = await deriveUint32(serverSecret, clientSeed, base + 10 + i);
    house.push(pickFlower(u));
  }
  return { player, house };
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function hasBlackOrWhite(player: string[], house: string[]): boolean {
  const all = [...player, ...house];
  return all.some((f) => f === "black" || f === "white");
}

type HandScore = { key: HandRankKey; label: string; value: number };

function scoreHand(hand: string[]): HandScore {
  const counts = new Map<string, number>();
  for (const c of hand) counts.set(c, (counts.get(c) ?? 0) + 1);
  const values = [...counts.values()].sort((a, b) => b - a);
  const pairCount = values.filter((n) => n === 2).length;

  let key: HandRankKey = "bust";
  if (values[0] === 5) key = "five_kind";
  else if (values[0] === 4) key = "four_kind";
  else if (values[0] === 3 && pairCount === 1) key = "full_house";
  else if (values[0] === 3) key = "three_kind";
  else if (pairCount === 2) key = "two_pair";
  else if (pairCount === 1) key = "one_pair";

  const rankValue: Record<HandRankKey, number> = {
    bust: 0,
    one_pair: 1,
    two_pair: 2,
    three_kind: 3,
    full_house: 4,
    four_kind: 5,
    five_kind: 6,
  };
  const labelMap: Record<HandRankKey, string> = {
    bust: "Bust",
    one_pair: "1 Pair",
    two_pair: "2 Pair",
    three_kind: "3 of a Kind",
    full_house: "Full House",
    four_kind: "4 of a Kind",
    five_kind: "5 of a Kind",
  };

  return { key, label: labelMap[key], value: rankValue[key] };
}

function compareHands(a: HandScore, b: HandScore): number {
  if (a.value === b.value) return 0;
  return a.value > b.value ? 1 : -1;
}

async function buildFairSnapshot(
  serverSeedHashHex: string,
  clientSeed: string,
  logicalSubRoundIndex: number,
  player: string[],
  house: string[],
  includeReveal: boolean,
  serverSeedSecretB64: string,
): Promise<Record<string, unknown>> {
  const rollDigest = await sha256HexString(
    `${player.join(",")}|${house.join(",")}|${logicalSubRoundIndex}|${clientSeed}`,
  );
  return {
    serverSeedHash: serverSeedHashHex,
    clientSeed,
    subRoundIndex: logicalSubRoundIndex,
    rollDigest,
    serverSeedReveal: includeReveal ? serverSeedSecretB64 : "",
  };
}

async function verifyRoundsAgainstSecret(meta: Record<string, unknown>): Promise<boolean> {
  const b64 = String(meta["serverSeedSecretB64"] ?? "");
  const clientSeed = String(meta["clientSeed"] ?? "");
  const roundProofs = meta["roundProofs"] as { player: string[]; house: string[] }[] | undefined;
  const currentRound = meta["currentRound"] as {
    player: string[];
    house: string[];
  } | undefined;
  if (!b64 || !clientSeed || !currentRound?.player || !currentRound?.house) return false;
  let secret: Uint8Array;
  try {
    secret = base64ToBytes(b64);
  } catch {
    return false;
  }
  const proofs = Array.isArray(roundProofs) ? roundProofs : [];
  for (let i = 0; i < proofs.length; i++) {
    const p = proofs[i];
    if (!p?.player || !p?.house) return false;
    const gen = await generateFullRound(secret, clientSeed, i);
    if (!arraysEqual(gen.player, p.player) || !arraysEqual(gen.house, p.house)) return false;
  }
  const final = await generateFullRound(secret, clientSeed, proofs.length);
  if (!arraysEqual(final.player, currentRound.player) || !arraysEqual(final.house, currentRound.house)) {
    return false;
  }
  return true;
}

function randomHex(len: number): string {
  const bytes = randomBytes(Math.ceil(len / 2));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, len);
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

  if (action === "start_bet") {
    let stake: number;
    try {
      stake = parsePositiveDecimal(body.betAmount);
    } catch {
      return json({ ok: false, error: "betAmount must be a positive decimal string." }, 400);
    }

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
      p_ref: "flowerpoker",
    });
    if (debitErr) {
      const msg = debitErr.message ?? String(debitErr);
      if (msg.includes("INSUFFICIENT_BALANCE")) return json({ ok: false, error: "Insufficient playable balance." }, 200);
      return json({ ok: false, error: msg }, 200);
    }

    const afterDebit = typeof afterDebitRaw === "number" ? afterDebitRaw : parseFloat(String(afterDebitRaw));
    const balanceAfterLock = Number.isFinite(afterDebit) ? afterDebit : 0;
    const balanceBefore = balanceAfterLock + stake;

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

    const { player, house } = await generateFullRound(serverSeedSecret, clientSeed, 0);
    const fairSnapshot = await buildFairSnapshot(
      serverSeedHashHex,
      clientSeed,
      0,
      player,
      house,
      false,
      serverSeedSecretB64,
    );

    const currentRound = {
      player,
      house,
      plantedCount: 0,
      fairSnapshot,
      currentRoundProofs: [] as { player: string[]; house: string[] }[],
    };

    const metadata: Record<string, unknown> = {
      status: "in_progress",
      stakeAmount: stake,
      payoutMultiplier: 1.9,
      startedAt: new Date().toISOString(),
      clientSeed,
      serverSeedHash: serverSeedHashHex,
      serverSeedSecretB64,
      roundProofs: [],
      currentRound,
    };

    const { data: gameRow, error: gameErr } = await supabase
      .from("claimy_game_sessions")
      .insert({
        user_id: userRow.id,
        game_key: "flowerpoker",
        balance_before: balanceBefore,
        balance_after: balanceAfterLock,
        delta: -stake,
        metadata,
      })
      .select("id")
      .single();

    if (gameErr || !gameRow?.id) {
      await supabase.rpc("claimy_apply_credit_delta", {
        p_wallet: walletAddress,
        p_delta: stake,
        p_entry_type: "game_bet_refund",
        p_ref: "flowerpoker_start_failed",
      });
      return json({ ok: false, error: "Could not start game session." }, 200);
    }

    return json({
      ok: true,
      gameId: gameRow.id,
      stakeAmount: stake,
      payoutMultiplier: 1.9,
      playableBalance: balanceAfterLock,
      round: currentRound,
    });
  }

  if (action === "reroll_round") {
    const gameId = String(body.gameId ?? "").trim();
    if (!gameId) return json({ ok: false, error: "gameId required." }, 400);

    const { data: userRow, error: userErr } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (userErr || !userRow?.id) return json({ ok: false, error: "Account not found." }, 200);

    const { data: gameRow, error: gameErr } = await supabase
      .from("claimy_game_sessions")
      .select("id, user_id, game_key, metadata")
      .eq("id", gameId)
      .maybeSingle<GameSessionRow>();
    if (gameErr || !gameRow || gameRow.user_id !== userRow.id || gameRow.game_key !== "flowerpoker") {
      return json({ ok: false, error: "Game session not found." }, 200);
    }
    const meta = (gameRow.metadata ?? {}) as Record<string, unknown>;
    if (meta["status"] !== "in_progress") {
      return json({ ok: false, error: "Game is not in progress." }, 200);
    }

    const cr = meta["currentRound"] as {
      player: string[];
      house: string[];
      plantedCount?: number;
    } | null;
    if (!cr?.player || !cr?.house || cr.player.length !== 5 || cr.house.length !== 5) {
      return json({ ok: false, error: "Invalid current round." }, 200);
    }
    if (!hasBlackOrWhite(cr.player, cr.house)) {
      return json({ ok: false, error: "Reroll only when black or white appears." }, 200);
    }

    const roundProofs = (meta["roundProofs"] as { player: string[]; house: string[] }[]) ?? [];
    const clientSeed = String(meta["clientSeed"] ?? "");
    const b64 = String(meta["serverSeedSecretB64"] ?? "");
    if (!clientSeed || !b64) return json({ ok: false, error: "Missing seed material." }, 200);

    let secret: Uint8Array;
    try {
      secret = base64ToBytes(b64);
    } catch {
      return json({ ok: false, error: "Invalid server seed encoding." }, 200);
    }

    const nextIndex = roundProofs.length;
    const verifyOld = await generateFullRound(secret, clientSeed, nextIndex);
    if (!arraysEqual(verifyOld.player, cr.player) || !arraysEqual(verifyOld.house, cr.house)) {
      return json({ ok: false, error: "Round state does not match server derivation." }, 200);
    }

    const newProofs = [...roundProofs, { player: [...cr.player], house: [...cr.house] }];
    const newSubIndex = newProofs.length;
    const { player, house } = await generateFullRound(secret, clientSeed, newSubIndex);
    const serverSeedHashHex = String(meta["serverSeedHash"] ?? (await sha256Hex(secret)));

    const fairSnapshot = await buildFairSnapshot(
      serverSeedHashHex,
      clientSeed,
      newSubIndex,
      player,
      house,
      false,
      b64,
    );

    const currentRound = {
      player,
      house,
      plantedCount: 0,
      fairSnapshot,
      currentRoundProofs: newProofs.map((p) => ({
        player: [...p.player],
        house: [...p.house],
      })),
    };

    const nextMeta = {
      ...meta,
      roundProofs: newProofs,
      currentRound,
    };

    const { error: upErr } = await supabase
      .from("claimy_game_sessions")
      .update({ metadata: nextMeta })
      .eq("id", gameId)
      .eq("user_id", userRow.id);
    if (upErr) return json({ ok: false, error: upErr.message ?? String(upErr) }, 200);

    return json({ ok: true, round: currentRound });
  }

  if (action === "save_round_state") {
    const gameId = String(body.gameId ?? "").trim();
    if (!gameId) return json({ ok: false, error: "gameId required." }, 400);

    const plantedRaw = body.plantedCount;
    const plantedCount =
      typeof plantedRaw === "number" && Number.isFinite(plantedRaw)
        ? Math.max(0, Math.min(5, Math.floor(plantedRaw)))
        : parseInt(String(plantedRaw ?? "0"), 10);
    if (!Number.isFinite(plantedCount) || plantedCount < 0 || plantedCount > 5) {
      return json({ ok: false, error: "plantedCount must be 0–5." }, 400);
    }

    const { data: userRow, error: userErr } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (userErr || !userRow?.id) return json({ ok: false, error: "Account not found." }, 200);

    const { data: gameRow, error: gameErr } = await supabase
      .from("claimy_game_sessions")
      .select("id, user_id, game_key, metadata")
      .eq("id", gameId)
      .maybeSingle<GameSessionRow>();
    if (gameErr || !gameRow || gameRow.user_id !== userRow.id || gameRow.game_key !== "flowerpoker") {
      return json({ ok: false, error: "Game session not found." }, 200);
    }
    const meta = (gameRow.metadata ?? {}) as Record<string, unknown>;
    if (meta["status"] !== "in_progress") {
      return json({ ok: false, error: "Game is not in progress." }, 200);
    }

    const cr = meta["currentRound"] as Record<string, unknown> | undefined;
    if (!cr || typeof cr !== "object") {
      return json({ ok: false, error: "No current round on server." }, 200);
    }

    const nextRound = { ...cr, plantedCount };
    const nextMeta = { ...meta, currentRound: nextRound };
    const { error: upErr } = await supabase
      .from("claimy_game_sessions")
      .update({ metadata: nextMeta })
      .eq("id", gameId)
      .eq("user_id", userRow.id);
    if (upErr) return json({ ok: false, error: upErr.message ?? String(upErr) }, 200);
    return json({ ok: true });
  }

  if (action === "resume_session") {
    const { data: userRow, error: userErr } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (userErr || !userRow?.id) return json({ ok: false, error: "Account not found." }, 200);

    const { data: rows, error: listErr } = await supabase
      .from("claimy_game_sessions")
      .select("id, metadata, created_at")
      .eq("user_id", userRow.id)
      .eq("game_key", "flowerpoker")
      .order("created_at", { ascending: false })
      .limit(25);
    if (listErr) return json({ ok: false, error: listErr.message ?? String(listErr) }, 200);

    const active = (rows ?? []).find((r) => {
      const m = r.metadata as Record<string, unknown> | null;
      return m && m["status"] === "in_progress";
    });
    if (!active) return json({ ok: true, active: false });

    const meta = (active.metadata ?? {}) as Record<string, unknown>;
    const stakeRaw = meta["stakeAmount"];
    const stake = typeof stakeRaw === "number" ? stakeRaw : parseFloat(String(stakeRaw ?? "0"));
    const currentRound = meta["currentRound"] ?? null;

    if (!currentRound || typeof currentRound !== "object") {
      if (Number.isFinite(stake) && stake > 0) {
        await supabase.rpc("claimy_apply_credit_delta", {
          p_wallet: walletAddress,
          p_delta: stake,
          p_entry_type: "game_bet_refund",
          p_ref: `flowerpoker_stale_resume:${active.id}`,
        });
        await supabase
          .from("claimy_game_sessions")
          .update({
            metadata: {
              ...meta,
              status: "abandoned_refunded",
              abandonedAt: new Date().toISOString(),
              abandonReason: "no_round_state_on_resume",
            },
          })
          .eq("id", active.id)
          .eq("user_id", userRow.id);
      }
      const { data: balRaw } = await supabase.rpc("claimy_get_playable_balance", { p_wallet: walletAddress });
      const pb = typeof balRaw === "number" ? balRaw : parseFloat(String(balRaw));
      return json({
        ok: true,
        active: false,
        staleRefunded: true,
        playableBalance: Number.isFinite(pb) ? pb : 0,
      });
    }

    const { data: balRaw, error: balErr } = await supabase.rpc("claimy_get_playable_balance", {
      p_wallet: walletAddress,
    });
    if (balErr) return json({ ok: false, error: balErr.message ?? String(balErr) }, 200);
    const playableBalance = typeof balRaw === "number" ? balRaw : parseFloat(String(balRaw));

    return json({
      ok: true,
      active: true,
      gameId: active.id,
      stakeAmount: Number.isFinite(stake) ? stake : 0,
      playableBalance: Number.isFinite(playableBalance) ? playableBalance : 0,
      currentRound,
    });
  }

  if (action === "settle_bet") {
    const gameId = String(body.gameId ?? "").trim();
    if (!gameId) return json({ ok: false, error: "gameId required." }, 400);

    const { data: userRow, error: userErr } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (userErr || !userRow?.id) return json({ ok: false, error: "Account not found." }, 200);

    const { data: gameRow, error: gameErr } = await supabase
      .from("claimy_game_sessions")
      .select("id, user_id, game_key, balance_before, metadata")
      .eq("id", gameId)
      .maybeSingle<GameSessionRow>();
    if (gameErr || !gameRow || gameRow.user_id !== userRow.id || gameRow.game_key !== "flowerpoker") {
      return json({ ok: false, error: "Game session not found." }, 200);
    }

    const currentMeta = (gameRow.metadata ?? {}) as Record<string, unknown>;
    if (currentMeta["status"] === "settled") return json({ ok: false, error: "Game already settled." }, 200);
    const stakeRaw = currentMeta["stakeAmount"];
    const stake = typeof stakeRaw === "number" ? stakeRaw : parseFloat(String(stakeRaw ?? "0"));
    if (!Number.isFinite(stake) || stake <= 0) return json({ ok: false, error: "Invalid game stake." }, 200);

    const cr = currentMeta["currentRound"] as {
      player: string[];
      house: string[];
      plantedCount?: number;
    } | null;
    if (!cr?.player || !cr?.house || cr.player.length !== 5 || cr.house.length !== 5) {
      return json({ ok: false, error: "Invalid round state." }, 200);
    }
    if (hasBlackOrWhite(cr.player, cr.house)) {
      return json({ ok: false, error: "Round still requires reroll (black/white)." }, 200);
    }

    const okDerive = await verifyRoundsAgainstSecret(currentMeta);
    if (!okDerive) return json({ ok: false, error: "Round does not match server seeds." }, 200);

    const ph = scoreHand(cr.player);
    const hh = scoreHand(cr.house);
    const cmp = compareHands(ph, hh);
    let winner: "Player" | "House" | "Tie";
    if (cmp > 0) winner = "Player";
    else if (cmp < 0) winner = "House";
    else winner = "Tie";

    const payout =
      winner === "Player"
        ? Math.round(stake * 1.9 * 1_000_000) / 1_000_000
        : winner === "Tie"
          ? stake
          : 0;

    let balanceAfter = 0;
    if (payout > 0) {
      const { data: afterCreditRaw, error: creditErr } = await supabase.rpc("claimy_apply_credit_delta", {
        p_wallet: walletAddress,
        p_delta: payout,
        p_entry_type: winner === "Tie" ? "game_refund" : "game_win_payout",
        p_ref: gameId,
      });
      if (creditErr) return json({ ok: false, error: creditErr.message ?? String(creditErr) }, 200);
      const n = typeof afterCreditRaw === "number" ? afterCreditRaw : parseFloat(String(afterCreditRaw));
      balanceAfter = Number.isFinite(n) ? n : 0;
    } else {
      const { data: balRaw, error: balErr } = await supabase.rpc("claimy_get_playable_balance", {
        p_wallet: walletAddress,
      });
      if (balErr) return json({ ok: false, error: balErr.message ?? String(balErr) }, 200);
      const n = typeof balRaw === "number" ? balRaw : parseFloat(String(balRaw));
      balanceAfter = Number.isFinite(n) ? n : 0;
    }

    const balanceBeforeRaw = gameRow.balance_before;
    const balanceBefore =
      typeof balanceBeforeRaw === "number" ? balanceBeforeRaw : parseFloat(String(balanceBeforeRaw));

    const b64 = String(currentMeta["serverSeedSecretB64"] ?? "");
    const clientSeed = String(currentMeta["clientSeed"] ?? "");
    const serverSeedHashHex = String(currentMeta["serverSeedHash"] ?? "");
    const roundProofs = (currentMeta["roundProofs"] as { player: string[]; house: string[] }[]) ?? [];
    const proofsPackage = roundProofs.map((p) => ({
      player: [...p.player],
      house: [...p.house],
    }));
    const finalFair = await buildFairSnapshot(
      serverSeedHashHex,
      clientSeed,
      roundProofs.length,
      cr.player,
      cr.house,
      true,
      b64,
    );

    const settledMeta = {
      ...currentMeta,
      status: "settled",
      settledAt: new Date().toISOString(),
      winner,
      payoutAmount: payout,
      rounds: proofsPackage,
      finalRound: { player: [...cr.player], house: [...cr.house] },
      playerHand: ph.label,
      houseHand: hh.label,
      fairSnapshot: finalFair,
      serverSeedRevealedAt: new Date().toISOString(),
    };
    delete settledMeta["serverSeedSecretB64"];

    const { error: updErr } = await supabase
      .from("claimy_game_sessions")
      .update({
        balance_after: balanceAfter,
        delta: (Number.isFinite(balanceBefore) ? balanceAfter - balanceBefore : -stake + payout),
        metadata: settledMeta,
      })
      .eq("id", gameId)
      .eq("user_id", userRow.id);
    if (updErr) return json({ ok: false, error: updErr.message ?? String(updErr) }, 200);

    return json({
      ok: true,
      gameId,
      winner,
      playerHand: ph.label,
      houseHand: hh.label,
      payoutAmount: payout,
      playableBalance: balanceAfter,
      fairSnapshot: finalFair,
    });
  }

  return json({
    ok: false,
    error: "Unknown action. Use: start_bet | reroll_round | save_round_state | resume_session | settle_bet",
  }, 400);
});
