/**
 * Blackjack — one fresh 52-card deck per game (provably fair shuffle from server + client seed).
 * claimy_game_sessions.game_key = "blackjack", same credit flow as flowerpoker-game.
 *
 * Actions: start_bet | player_action | resume_session
 * player_action.move: insurance_yes | insurance_no | hit | stand | double
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertStakeWithinBankrollCap } from "./bankroll-stake-cap.ts";

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
  const msg = `claimy-bj|v1|${clientSeed}|${counter}`;
  const h = await hmacSha256(serverSecret, msg);
  const view = new DataView(h.buffer);
  return view.getUint32(0, false) >>> 0;
}

const SUITS = ["S", "H", "D", "C"] as const;
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

function freshDeck(): string[] {
  const d: string[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) d.push(`${s}${r}`);
  }
  return d;
}

async function shuffleDeck(serverSecret: Uint8Array, clientSeed: string, deck: string[]): Promise<string[]> {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const u = await deriveUint32(serverSecret, clientSeed, 3000 + i);
    const j = u % (i + 1);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function rankOf(card: string): string {
  return card.slice(1);
}

function cardValue(rank: string): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  if (rank === "10") return 10;
  return parseInt(rank, 10);
}

type HandScore = { total: number; soft: boolean; bust: boolean };

function scoreHand(cards: string[]): HandScore {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === "A") {
      aces++;
      total += 11;
    } else {
      total += cardValue(r);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  const soft = aces > 0 && total <= 21;
  return { total, soft, bust: total > 21 };
}

function isBlackjack(cards: string[]): boolean {
  return cards.length === 2 && scoreHand(cards).total === 21;
}

function isTenValue(card: string): boolean {
  const r = rankOf(card);
  return r === "10" || r === "J" || r === "Q" || r === "K";
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
  shuffledDeck: string[],
  includeReveal: boolean,
  serverSeedSecretB64: string,
): Promise<Record<string, unknown>> {
  const rollDigest = await sha256HexString(`${shuffledDeck.join(",")}|${clientSeed}`);
  return {
    serverSeedHash: serverSeedHashHex,
    clientSeed,
    shuffledDeckPreview: shuffledDeck.slice(0, 5),
    rollDigest,
    serverSeedReveal: includeReveal ? serverSeedSecretB64 : "",
  };
}

type BjPhase =
  | "insurance_offer"
  | "player_turn"
  | "settled";

type BjMeta = {
  status: "in_progress" | "settled";
  phase: BjPhase;
  stakeAmount: number;
  baseStake: number;
  mainStake: number;
  doubleStake: number;
  insuranceStake: number;
  startedAt: string;
  clientSeed: string;
  serverSeedHash: string;
  serverSeedSecretB64: string;
  shuffledDeck: string[];
  deckRemaining: string[];
  playerCards: string[];
  dealerCards: string[];
  holeRevealed: boolean;
  doubled: boolean;
  insuranceResolved: boolean;
  roundLog: { t: string; detail?: string }[];
};

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function publicGameState(meta: BjMeta, walletForCredit: string | null) {
  const pScore = scoreHand(meta.playerCards);
  const dScore = meta.holeRevealed ? scoreHand(meta.dealerCards) : scoreHand([meta.dealerCards[0]!]);
  const up = meta.dealerCards[0]!;
  const canInsurance = meta.phase === "insurance_offer" && !meta.insuranceResolved;
  const canDouble =
    meta.phase === "player_turn" &&
    meta.playerCards.length === 2 &&
    !meta.doubled &&
    !meta.insuranceResolved;
  return {
    phase: meta.phase,
    status: meta.status,
    playerCards: [...meta.playerCards],
    dealerCards: meta.holeRevealed
      ? [...meta.dealerCards]
      : [up, "??"],
    holeRevealed: meta.holeRevealed,
    playerTotal: pScore.bust ? "Bust" : String(pScore.total),
    dealerTotal: meta.holeRevealed
      ? (dScore.bust ? "Bust" : String(dScore.total))
      : isTenValue(up) || rankOf(up) === "A"
        ? "?"
        : String(scoreHand([up]).total),
    canHit: meta.phase === "player_turn" && !pScore.bust && !meta.doubled,
    canStand: meta.phase === "player_turn" && !pScore.bust,
    canDouble,
    canInsurance,
    stakeAmount: meta.stakeAmount,
    baseStake: meta.baseStake,
    mainStake: meta.mainStake,
    doubleStake: meta.doubleStake,
    insuranceStake: meta.insuranceStake,
    roundLog: meta.roundLog,
    fairSnapshot: null as Record<string, unknown> | null,
    walletAddress: walletForCredit,
  };
}

async function settleSession(
  supabase: ReturnType<typeof createClient>,
  walletAddress: string,
  gameRow: GameSessionRow,
  meta: BjMeta,
  outcome: {
    winner: "Player" | "House" | "Tie";
    playerHandLabel: string;
    houseHandLabel: string;
    payoutAmount: number;
  },
): Promise<{ ok: boolean; error?: string; balanceAfter?: number; fairSnapshot?: Record<string, unknown> }> {
  if (meta.status === "settled") return { ok: false, error: "Already settled." };

  let balanceAfter = 0;
  if (outcome.payoutAmount > 0) {
    const { data: afterCreditRaw, error: creditErr } = await supabase.rpc("claimy_apply_credit_delta", {
      p_wallet: walletAddress,
      p_delta: outcome.payoutAmount,
      p_entry_type: outcome.winner === "Tie" ? "game_refund" : "game_win_payout",
      p_ref: gameRow.id,
    });
    if (creditErr) {
      const msg = creditErr.message ?? String(creditErr);
      return { ok: false, error: msg };
    }
    const after = typeof afterCreditRaw === "number" ? afterCreditRaw : parseFloat(String(afterCreditRaw));
    balanceAfter = Number.isFinite(after) ? after : 0;
  } else {
    const { data: balRaw, error: balErr } = await supabase.rpc("claimy_get_playable_balance", {
      p_wallet: walletAddress,
    });
    if (balErr) return { ok: false, error: balErr.message ?? String(balErr) };
    const n = typeof balRaw === "number" ? balRaw : parseFloat(String(balRaw));
    balanceAfter = Number.isFinite(n) ? n : 0;
  }

  const balanceBeforeRaw = gameRow.balance_before;
  const balanceBefore =
    typeof balanceBeforeRaw === "number" ? balanceBeforeRaw : parseFloat(String(balanceBeforeRaw));

  const b64 = meta.serverSeedSecretB64;
  const fairSnapshot = await buildFairSnapshot(
    meta.serverSeedHash,
    meta.clientSeed,
    meta.shuffledDeck,
    true,
    b64,
  );

  const settledMeta: Record<string, unknown> = {
    ...meta,
    status: "settled",
    settledAt: new Date().toISOString(),
    winner: outcome.winner,
    payoutAmount: outcome.payoutAmount,
    playerHand: outcome.playerHandLabel,
    houseHand: outcome.houseHandLabel,
    fairSnapshot,
    finalRound: {
      player: [...meta.playerCards],
      house: [...meta.dealerCards],
    },
    serverSeedRevealedAt: new Date().toISOString(),
  };
  delete settledMeta["serverSeedSecretB64"];

  const { error: updErr } = await supabase
    .from("claimy_game_sessions")
    .update({
      balance_after: balanceAfter,
      delta: (Number.isFinite(balanceBefore) ? balanceAfter - balanceBefore : -meta.stakeAmount + outcome.payoutAmount),
      metadata: settledMeta,
    })
    .eq("id", gameRow.id)
    .eq("user_id", gameRow.user_id);
  if (updErr) return { ok: false, error: updErr.message ?? String(updErr) };
  return { ok: true, balanceAfter, fairSnapshot };
}

function dealerShouldHit(score: HandScore): boolean {
  if (score.bust) return false;
  return score.total < 17;
}

function playDealer(deck: string[], dealerCards: string[]): { cards: string[]; deck: string[] } {
  const cards = [...dealerCards];
  let d = [...deck];
  while (dealerShouldHit(scoreHand(cards)) && d.length > 0) {
    cards.push(d.shift()!);
  }
  return { cards, deck: d };
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

    const cap0 = await assertStakeWithinBankrollCap(supabase, stake);
    if (!cap0.ok) {
      return json(
        {
          ok: false,
          error: cap0.error,
          maxStake: cap0.maxStake,
          bankrollBalanceUi: cap0.bankrollBalanceUi,
          ratio: cap0.ratio,
        },
        200,
      );
    }

    const { data: afterDebitRaw, error: debitErr } = await supabase.rpc("claimy_apply_credit_delta", {
      p_wallet: walletAddress,
      p_delta: -stake,
      p_entry_type: "game_bet_locked",
      p_ref: "blackjack",
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

    const ordered = await shuffleDeck(serverSeedSecret, clientSeed, freshDeck());
    const playerCards = [ordered[0]!, ordered[2]!];
    const dealerCards = [ordered[1]!, ordered[3]!];
    const deckRemaining = ordered.slice(4);

    const baseStake = stake;
    const meta: BjMeta = {
      status: "in_progress",
      phase: "player_turn",
      stakeAmount: stake,
      baseStake,
      mainStake: stake,
      doubleStake: 0,
      insuranceStake: 0,
      startedAt: new Date().toISOString(),
      clientSeed,
      serverSeedHash: serverSeedHashHex,
      serverSeedSecretB64,
      shuffledDeck: [...ordered],
      deckRemaining,
      playerCards,
      dealerCards,
      holeRevealed: false,
      doubled: false,
      insuranceResolved: false,
      roundLog: [{ t: "deal", detail: "Fresh deck shuffled; initial deal." }],
    };

    const up = dealerCards[0]!;
    const rankUp = rankOf(up);

    if (rankUp === "A") {
      meta.phase = "insurance_offer";
      meta.roundLog.push({ t: "insurance", detail: "Dealer shows an Ace — insurance offered." });
    } else if (isTenValue(up)) {
      meta.insuranceResolved = true;
      const dBJ = isBlackjack(dealerCards);
      const pBJ = isBlackjack(playerCards);
      meta.roundLog.push({
        t: "peek",
        detail: dBJ ? "Dealer has blackjack." : "Dealer does not have blackjack.",
      });
      if (dBJ || pBJ) {
        meta.holeRevealed = true;
      } else {
        meta.holeRevealed = false;
      }
    } else if (isBlackjack(playerCards)) {
      meta.holeRevealed = true;
      meta.insuranceResolved = true;
    }

    const fairSnap = await buildFairSnapshot(serverSeedHashHex, clientSeed, ordered, false, serverSeedSecretB64);

    const { data: gameRow, error: gameErr } = await supabase
      .from("claimy_game_sessions")
      .insert({
        user_id: userRow.id,
        game_key: "blackjack",
        balance_before: balanceBefore,
        balance_after: balanceAfterLock,
        delta: -stake,
        metadata: { ...meta, fairSnapshot: fairSnap } as unknown as Record<string, unknown>,
      })
      .select("id, user_id, balance_before")
      .single();

    if (gameErr || !gameRow?.id) {
      await supabase.rpc("claimy_apply_credit_delta", {
        p_wallet: walletAddress,
        p_delta: stake,
        p_entry_type: "game_bet_refund",
        p_ref: "blackjack_start_failed",
      });
      return json({ ok: false, error: "Could not start game session." }, 200);
    }

    const gid = gameRow.id;
    const fullGameRow: GameSessionRow = {
      id: gid,
      user_id: gameRow.user_id,
      game_key: "blackjack",
      balance_before: gameRow.balance_before,
      metadata: meta as unknown as Record<string, unknown>,
    };

    if (rankUp === "A") {
      const pub = publicGameState(meta, null);
      pub.fairSnapshot = fairSnap;
      return json({
        ok: true,
        gameId: gid,
        stakeAmount: stake,
        playableBalance: balanceAfterLock,
        game: pub,
        settled: false,
      });
    }

    if (isTenValue(up)) {
      const dBJ = isBlackjack(dealerCards);
      const pBJ = isBlackjack(playerCards);
      if (dBJ) {
        if (pBJ) {
          const ps = scoreHand(playerCards);
          const hs = scoreHand(dealerCards);
          const payout = round6(meta.mainStake + meta.doubleStake);
          const st = await settleSession(supabase, walletAddress, fullGameRow, meta, {
            winner: "Tie",
            playerHandLabel: `Blackjack (${ps.total})`,
            houseHandLabel: `Blackjack (${hs.total})`,
            payoutAmount: payout,
          });
          if (!st.ok) {
            await supabase.rpc("claimy_apply_credit_delta", {
              p_wallet: walletAddress,
              p_delta: stake,
              p_entry_type: "game_bet_refund",
              p_ref: "blackjack_peek_fail",
            });
            return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
          }
          return json({
            ok: true,
            settled: true,
            gameId: gid,
            winner: "Tie",
            payoutAmount: payout,
            playableBalance: st.balanceAfter,
            playerHand: `Blackjack (${ps.total})`,
            houseHand: `Blackjack (${hs.total})`,
            game: publicGameState(meta, null),
            fairSnapshot: st.fairSnapshot,
          });
        }
        const ps = scoreHand(playerCards);
        const hs = scoreHand(dealerCards);
        const st = await settleSession(supabase, walletAddress, fullGameRow, meta, {
          winner: "House",
          playerHandLabel: `${ps.total}`,
          houseHandLabel: `Blackjack (${hs.total})`,
          payoutAmount: 0,
        });
        if (!st.ok) {
          await supabase.rpc("claimy_apply_credit_delta", {
            p_wallet: walletAddress,
            p_delta: stake,
            p_entry_type: "game_bet_refund",
            p_ref: "blackjack_peek_fail",
          });
          return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
        }
        return json({
          ok: true,
          settled: true,
          gameId: gid,
          winner: "House",
          payoutAmount: 0,
          playableBalance: st.balanceAfter,
          playerHand: `${ps.total}`,
          houseHand: `Blackjack (${hs.total})`,
          game: publicGameState(meta, null),
          fairSnapshot: st.fairSnapshot,
        });
      }
      if (pBJ) {
        const ps = scoreHand(playerCards);
        const hs = scoreHand(dealerCards);
        const payout = round6(1.9 * meta.mainStake);
        const st = await settleSession(supabase, walletAddress, fullGameRow, meta, {
          winner: "Player",
          playerHandLabel: `Blackjack (${ps.total})`,
          houseHandLabel: `${hs.total}`,
          payoutAmount: payout,
        });
        if (!st.ok) {
          await supabase.rpc("claimy_apply_credit_delta", {
            p_wallet: walletAddress,
            p_delta: stake,
            p_entry_type: "game_bet_refund",
            p_ref: "blackjack_peek_fail",
          });
          return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
        }
        return json({
          ok: true,
          settled: true,
          gameId: gid,
          winner: "Player",
          payoutAmount: payout,
          playableBalance: st.balanceAfter,
          playerHand: `Blackjack (${ps.total})`,
          houseHand: `${hs.total}`,
          game: publicGameState(meta, null),
          fairSnapshot: st.fairSnapshot,
        });
      }
      const pub = publicGameState(meta, null);
      pub.fairSnapshot = fairSnap;
      return json({
        ok: true,
        gameId: gid,
        stakeAmount: stake,
        playableBalance: balanceAfterLock,
        game: pub,
        settled: false,
      });
    }

    if (isBlackjack(playerCards)) {
      const ps = scoreHand(playerCards);
      const hs = scoreHand(dealerCards);
      const payout = round6(1.9 * meta.mainStake);
      const st = await settleSession(supabase, walletAddress, fullGameRow, meta, {
        winner: "Player",
        playerHandLabel: `Blackjack (${ps.total})`,
        houseHandLabel: `${hs.total}`,
        payoutAmount: payout,
      });
      if (!st.ok) {
        await supabase.rpc("claimy_apply_credit_delta", {
          p_wallet: walletAddress,
          p_delta: stake,
          p_entry_type: "game_bet_refund",
          p_ref: "blackjack_natural_fail",
        });
        return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
      }
      return json({
        ok: true,
        settled: true,
        gameId: gid,
        winner: "Player",
        payoutAmount: payout,
        playableBalance: st.balanceAfter,
        playerHand: `Blackjack (${ps.total})`,
        houseHand: `${hs.total}`,
        game: publicGameState(meta, null),
        fairSnapshot: st.fairSnapshot,
      });
    }

    const pub = publicGameState(meta, null);
    pub.fairSnapshot = fairSnap;
    return json({
      ok: true,
      gameId: gid,
      stakeAmount: stake,
      playableBalance: balanceAfterLock,
      game: pub,
      settled: false,
    });
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
      .eq("game_key", "blackjack")
      .order("created_at", { ascending: false })
      .limit(25);
    if (listErr) return json({ ok: false, error: listErr.message ?? String(listErr) }, 200);

    const active = (rows ?? []).find((r) => {
      const m = r.metadata as Record<string, unknown> | null;
      return m && m["status"] === "in_progress";
    });
    if (!active) return json({ ok: true, active: false });

    const meta = (active.metadata ?? {}) as BjMeta;
    const stakeRaw = meta.stakeAmount;
    const stake = typeof stakeRaw === "number" ? stakeRaw : parseFloat(String(stakeRaw ?? "0"));
    if (!meta.playerCards?.length || !meta.dealerCards?.length) {
      if (Number.isFinite(stake) && stake > 0) {
        await supabase.rpc("claimy_apply_credit_delta", {
          p_wallet: walletAddress,
          p_delta: stake,
          p_entry_type: "game_bet_refund",
          p_ref: `blackjack_stale_resume:${active.id}`,
        });
        await supabase
          .from("claimy_game_sessions")
          .update({
            metadata: {
              ...meta,
              status: "abandoned_refunded",
              abandonedAt: new Date().toISOString(),
              abandonReason: "invalid_state_on_resume",
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

    const pub = publicGameState(meta, null);
    const fs = (active.metadata as Record<string, unknown>)["fairSnapshot"];
    pub.fairSnapshot = fs && typeof fs === "object" ? (fs as Record<string, unknown>) : null;

    return json({
      ok: true,
      active: true,
      gameId: active.id,
      stakeAmount: Number.isFinite(stake) ? stake : 0,
      playableBalance: Number.isFinite(playableBalance) ? playableBalance : 0,
      game: pub,
    });
  }

  if (action === "player_action") {
    const gameId = String(body.gameId ?? "").trim();
    const move = String(body.move ?? "").trim() as
      | "insurance_yes"
      | "insurance_no"
      | "hit"
      | "stand"
      | "double";
    if (!gameId) return json({ ok: false, error: "gameId required." }, 400);
    if (
      move !== "insurance_yes" &&
      move !== "insurance_no" &&
      move !== "hit" &&
      move !== "stand" &&
      move !== "double"
    ) {
      return json({ ok: false, error: "Invalid move." }, 400);
    }

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
    if (gameErr || !gameRow || gameRow.user_id !== userRow.id || gameRow.game_key !== "blackjack") {
      return json({ ok: false, error: "Game session not found." }, 200);
    }

    let meta = { ...(gameRow.metadata ?? {}) } as unknown as BjMeta;
    if (meta.status !== "in_progress") {
      return json({ ok: false, error: "Game is not in progress." }, 200);
    }

    const persist = async (m: BjMeta, extraFair?: Record<string, unknown>) => {
      const md: Record<string, unknown> = { ...m, ...(extraFair ? { fairSnapshot: extraFair } : {}) };
      await supabase
        .from("claimy_game_sessions")
        .update({ metadata: md })
        .eq("id", gameId)
        .eq("user_id", userRow.id);
    };

    const finish = async (
      outcome: {
        winner: "Player" | "House" | "Tie";
        playerHandLabel: string;
        houseHandLabel: string;
        payoutAmount: number;
      },
      m: BjMeta,
    ) => {
      m.holeRevealed = true;
      const st = await settleSession(supabase, walletAddress, { ...gameRow, metadata: m as unknown as Record<string, unknown> }, m, outcome);
      return st;
    };

    // --- Insurance ---
    if (move === "insurance_yes" || move === "insurance_no") {
      if (meta.phase !== "insurance_offer" || meta.insuranceResolved) {
        return json({ ok: false, error: "Insurance not available." }, 200);
      }
      const insAmt = round6(0.5 * meta.baseStake);
      if (move === "insurance_yes") {
        const insCap = await assertStakeWithinBankrollCap(supabase, insAmt);
        if (!insCap.ok) {
          return json(
            {
              ok: false,
              error: insCap.error,
              maxStake: insCap.maxStake,
              bankrollBalanceUi: insCap.bankrollBalanceUi,
              ratio: insCap.ratio,
            },
            200,
          );
        }
        const { data: afterIns, error: insErr } = await supabase.rpc("claimy_apply_credit_delta", {
          p_wallet: walletAddress,
          p_delta: -insAmt,
          p_entry_type: "game_bet_locked",
          p_ref: "blackjack_insurance",
        });
        if (insErr) {
          const msg = insErr.message ?? String(insErr);
          if (msg.includes("INSUFFICIENT_BALANCE")) return json({ ok: false, error: "Insufficient playable balance for insurance." }, 200);
          return json({ ok: false, error: msg }, 200);
        }
        meta.insuranceStake = insAmt;
        meta.stakeAmount = round6(meta.stakeAmount + insAmt);
        meta.roundLog.push({ t: "insurance", detail: `Insurance taken (${insAmt}).` });
      } else {
        meta.roundLog.push({ t: "insurance", detail: "Insurance declined." });
      }
      meta.insuranceResolved = true;
      meta.holeRevealed = true;

      const dBJ = isBlackjack(meta.dealerCards);
      const pBJ = isBlackjack(meta.playerCards);
      meta.roundLog.push({ t: "peek", detail: dBJ ? "Dealer has blackjack." : "Dealer does not have blackjack." });

      if (dBJ) {
        if (pBJ) {
          const ps = scoreHand(meta.playerCards);
          const hs = scoreHand(meta.dealerCards);
          let payout = meta.mainStake + meta.doubleStake;
          if (meta.insuranceStake > 0) {
            payout += 3 * meta.insuranceStake;
          }
          payout = round6(payout);
          const st = await finish(
            {
              winner: "Tie",
              playerHandLabel: `Blackjack (${ps.total})`,
              houseHandLabel: `Blackjack (${hs.total})`,
              payoutAmount: payout,
            },
            meta,
          );
          if (!st.ok) return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
          return json({
            ok: true,
            settled: true,
            winner: "Tie",
            payoutAmount: payout,
            playableBalance: st.balanceAfter,
            game: publicGameState(meta, null),
            fairSnapshot: st.fairSnapshot,
          });
        } else {
          let payout = 0;
          if (meta.insuranceStake > 0) {
            payout = round6(3 * meta.insuranceStake);
          }
          const ps = scoreHand(meta.playerCards);
          const hs = scoreHand(meta.dealerCards);
          const st = await finish(
            {
              winner: "House",
              playerHandLabel: `${ps.total}`,
              houseHandLabel: `Blackjack (${hs.total})`,
              payoutAmount: payout,
            },
            meta,
          );
          if (!st.ok) return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
          return json({
            ok: true,
            settled: true,
            winner: "House",
            payoutAmount: payout,
            playableBalance: st.balanceAfter,
            game: publicGameState(meta, null),
            fairSnapshot: st.fairSnapshot,
          });
        }
      }

      if (pBJ) {
        const ps = scoreHand(meta.playerCards);
        const hs = scoreHand(meta.dealerCards);
        const payout = round6(1.9 * meta.mainStake);
        const st = await finish(
          {
            winner: "Player",
            playerHandLabel: `Blackjack (${ps.total})`,
            houseHandLabel: `${hs.total}`,
            payoutAmount: payout,
          },
          meta,
        );
        if (!st.ok) return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
        return json({
          ok: true,
          settled: true,
          winner: "Player",
          payoutAmount: payout,
          playableBalance: st.balanceAfter,
          game: publicGameState(meta, null),
          fairSnapshot: st.fairSnapshot,
        });
      }

      meta.phase = "player_turn";
      meta.holeRevealed = false;
      await persist(meta);
      const pub = publicGameState(meta, null);
      const fs = (gameRow.metadata as Record<string, unknown>)["fairSnapshot"];
      pub.fairSnapshot = fs && typeof fs === "object" ? (fs as Record<string, unknown>) : null;
      const { data: balRaw } = await supabase.rpc("claimy_get_playable_balance", { p_wallet: walletAddress });
      const pb = typeof balRaw === "number" ? balRaw : parseFloat(String(balRaw));
      return json({
        ok: true,
        settled: false,
        playableBalance: Number.isFinite(pb) ? pb : 0,
        game: pub,
      });
    }

    if (meta.phase !== "player_turn") {
      return json({ ok: false, error: "Not your turn." }, 200);
    }

    // --- Double ---
    if (move === "double") {
      if (meta.playerCards.length !== 2 || meta.doubled) {
        return json({ ok: false, error: "Double down only on your first two cards." }, 200);
      }
      const add = meta.mainStake;
      const dCap = await assertStakeWithinBankrollCap(supabase, add);
      if (!dCap.ok) {
        return json(
          {
            ok: false,
            error: dCap.error,
            maxStake: dCap.maxStake,
            bankrollBalanceUi: dCap.bankrollBalanceUi,
            ratio: dCap.ratio,
          },
          200,
        );
      }
      const { error: dErr } = await supabase.rpc("claimy_apply_credit_delta", {
        p_wallet: walletAddress,
        p_delta: -add,
        p_entry_type: "game_bet_locked",
        p_ref: "blackjack_double",
      });
      if (dErr) {
        const msg = dErr.message ?? String(dErr);
        if (msg.includes("INSUFFICIENT_BALANCE")) return json({ ok: false, error: "Insufficient playable balance to double." }, 200);
        return json({ ok: false, error: msg }, 200);
      }
      meta.doubleStake = add;
      meta.stakeAmount = round6(meta.stakeAmount + add);
      meta.doubled = true;
      const next = meta.deckRemaining.shift();
      if (!next) return json({ ok: false, error: "Deck error." }, 200);
      meta.playerCards.push(next);
      meta.roundLog.push({ t: "double", detail: `Doubled; drew ${next}.` });

      const ps = scoreHand(meta.playerCards);
      if (ps.bust) {
        meta.holeRevealed = true;
        const hs = scoreHand(meta.dealerCards);
        const st = await finish(
          {
            winner: "House",
            playerHandLabel: "Bust",
            houseHandLabel: `${hs.total}`,
            payoutAmount: 0,
          },
          meta,
        );
        if (!st.ok) return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
        return json({
          ok: true,
          settled: true,
          winner: "House",
          payoutAmount: 0,
          playableBalance: st.balanceAfter,
          game: publicGameState(meta, null),
          fairSnapshot: st.fairSnapshot,
        });
      }

      meta.holeRevealed = true;
      let deck = [...meta.deckRemaining];
      const played = playDealer(deck, meta.dealerCards);
      meta.dealerCards = played.cards;
      meta.deckRemaining = played.deck;
      const psc = scoreHand(meta.playerCards);
      const dsc = scoreHand(meta.dealerCards);
      meta.roundLog.push({ t: "dealer", detail: `Dealer stands/hits to ${dsc.bust ? "bust" : dsc.total}.` });

      let winner: "Player" | "House" | "Tie";
      if (dsc.bust) winner = "Player";
      else if (psc.total > dsc.total) winner = "Player";
      else if (psc.total < dsc.total) winner = "House";
      else winner = "Tie";

      const handBet = meta.mainStake + meta.doubleStake;
      let payout = 0;
      if (winner === "Player") payout = round6(1.9 * handBet);
      else if (winner === "Tie") payout = round6(handBet);
      else payout = 0;

      const st = await finish(
        {
          winner,
          playerHandLabel: `${psc.total}`,
          houseHandLabel: dsc.bust ? "Bust" : `${dsc.total}`,
          payoutAmount: payout,
        },
        meta,
      );
      if (!st.ok) return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
      return json({
        ok: true,
        settled: true,
        winner,
        payoutAmount: payout,
        playableBalance: st.balanceAfter,
        game: publicGameState(meta, null),
        fairSnapshot: st.fairSnapshot,
      });
    }

    // --- Hit ---
    if (move === "hit") {
      if (meta.doubled) return json({ ok: false, error: "Cannot hit after double." }, 200);
      const next = meta.deckRemaining.shift();
      if (!next) return json({ ok: false, error: "Deck error." }, 200);
      meta.playerCards.push(next);
      meta.roundLog.push({ t: "hit", detail: `Drew ${next}.` });
      const ps = scoreHand(meta.playerCards);
      if (ps.bust) {
        meta.holeRevealed = true;
        const hs = scoreHand(meta.dealerCards);
        const st = await finish(
          {
            winner: "House",
            playerHandLabel: "Bust",
            houseHandLabel: `${hs.total}`,
            payoutAmount: 0,
          },
          meta,
        );
        if (!st.ok) return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
        return json({
          ok: true,
          settled: true,
          winner: "House",
          payoutAmount: 0,
          playableBalance: st.balanceAfter,
          game: publicGameState(meta, null),
          fairSnapshot: st.fairSnapshot,
        });
      }
      await persist(meta);
      const pub = publicGameState(meta, null);
      const fs = (gameRow.metadata as Record<string, unknown>)["fairSnapshot"];
      pub.fairSnapshot = fs && typeof fs === "object" ? (fs as Record<string, unknown>) : null;
      const { data: balRaw } = await supabase.rpc("claimy_get_playable_balance", { p_wallet: walletAddress });
      const pb = typeof balRaw === "number" ? balRaw : parseFloat(String(balRaw));
      return json({
        ok: true,
        settled: false,
        playableBalance: Number.isFinite(pb) ? pb : 0,
        game: pub,
      });
    }

    // --- Stand ---
    if (move === "stand") {
      meta.holeRevealed = true;
      let deck = [...meta.deckRemaining];
      const played = playDealer(deck, meta.dealerCards);
      meta.dealerCards = played.cards;
      meta.deckRemaining = played.deck;
      const psc = scoreHand(meta.playerCards);
      const dsc = scoreHand(meta.dealerCards);
      meta.roundLog.push({ t: "dealer", detail: `Dealer draws to ${dsc.bust ? "bust" : dsc.total}.` });

      let winner: "Player" | "House" | "Tie";
      if (dsc.bust) winner = "Player";
      else if (psc.total > dsc.total) winner = "Player";
      else if (psc.total < dsc.total) winner = "House";
      else winner = "Tie";

      const handBet = meta.mainStake + meta.doubleStake;
      let payout = 0;
      if (winner === "Player") payout = round6(1.9 * handBet);
      else if (winner === "Tie") payout = round6(handBet);
      else payout = 0;

      const st = await finish(
        {
          winner,
          playerHandLabel: `${psc.total}`,
          houseHandLabel: dsc.bust ? "Bust" : `${dsc.total}`,
          payoutAmount: payout,
        },
        meta,
      );
      if (!st.ok) return json({ ok: false, error: st.error ?? "Settle failed." }, 200);
      return json({
        ok: true,
        settled: true,
        winner,
        payoutAmount: payout,
        playableBalance: st.balanceAfter,
        game: publicGameState(meta, null),
        fairSnapshot: st.fairSnapshot,
      });
    }

    return json({ ok: false, error: "Unsupported action." }, 400);
  }

  return json({
    ok: false,
    error: "Unknown action. Use: start_bet | player_action | resume_session",
  }, 400);
});
