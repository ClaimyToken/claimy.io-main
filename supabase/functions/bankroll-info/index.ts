/**
 * GET /bankroll-info — returns max stake vs on-chain bankroll (for game UIs).
 * Uses same secrets as ./bankroll-stake-cap.ts.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getBankrollStakeCapInfo } from "./bankroll-stake-cap.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "Server misconfigured." }, 500);
  const supabase = createClient(url, key);

  const cap = await getBankrollStakeCapInfo(supabase);
  if (!cap.ok) {
    return json({
      ok: false,
      error: cap.error,
      configured: !!Deno.env.get("CLAIMY_BANKROLL_WALLET")?.trim(),
    });
  }
  if (!cap.enforced) {
    return json({
      ok: true,
      enforced: false,
      maxStake: null,
      bankrollBalanceUi: null,
      ratio: null,
      ratioPercent: null,
    });
  }
  return json({
    ok: true,
    enforced: true,
    maxStake: cap.maxStake,
    bankrollBalanceUi: cap.bankrollBalanceUi,
    ratio: cap.ratio,
    ratioPercent: cap.ratio * 100,
  });
});
