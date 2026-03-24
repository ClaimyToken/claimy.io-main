/**
 * Supabase Edge: playhouse-feed
 * POST JSON:
 *   { "action": "list_bets", "page": 1, "pageSize": 15, "walletAddress": "<optional filter>" }
 *   { "action": "player_ranking_stats", "walletAddress": "<required>" }
 *
 * list_bets: settled Flowerpoker sessions (public feed). walletAddress filters to that wallet when set.
 * player_ranking_stats: one row of SUM/COUNT aggregates for Ranking progress (settled only).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Deploy: set `verify_jwt = false` in `supabase/config.toml` ([functions.playhouse-feed]) so the public feed works without a Supabase JWT.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/** Match browser preflight + other public Edge functions (wallet-login, flowerpoker-game). */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, prefer, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "Server misconfigured." }, 500);

  const supabase = createClient(url, key);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();

  if (action === "player_ranking_stats") {
    const wallet = String(body.walletAddress ?? "").trim();
    if (!wallet) {
      return json({ ok: false, error: "walletAddress is required for player_ranking_stats" }, 400);
    }
    const { data, error } = await supabase.rpc("playhouse_player_ranking_stats", {
      p_wallet: wallet,
    });
    if (error) {
      return json({ ok: false, error: error.message ?? String(error) }, 200);
    }
    const stats = data && typeof data === "object" ? data : {};
    return json({ ok: true, stats });
  }

  if (action !== "list_bets") {
    return json({ ok: false, error: "Unknown action. Use: list_bets | player_ranking_stats" }, 400);
  }

  let page = Math.max(1, parseInt(String(body.page ?? "1"), 10) || 1);
  let pageSize = Math.min(50, Math.max(1, parseInt(String(body.pageSize ?? "15"), 10) || 15));
  const walletRaw = String(body.walletAddress ?? "").trim();
  const walletFilter = walletRaw.length > 0 ? walletRaw : null;

  const offset = (page - 1) * pageSize;

  const { data: raw, error } = await supabase.rpc("playhouse_list_settled_bets", {
    p_wallet: walletFilter,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    return json({ ok: false, error: error.message ?? String(error) }, 200);
  }

  const payload = raw as { total?: number; rows?: unknown } | null;
  const total = typeof payload?.total === "number" ? payload.total : 0;
  const rows = Array.isArray(payload?.rows) ? payload!.rows : [];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages && totalPages > 0) {
    page = totalPages;
  }

  return json({
    ok: true,
    page,
    pageSize,
    total,
    totalPages,
    rows,
  });
});
