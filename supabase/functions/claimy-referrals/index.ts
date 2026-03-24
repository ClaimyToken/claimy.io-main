/**
 * Supabase Edge: claimy-referrals
 * POST JSON:
 *   { "action": "leaderboard_referrals" } — top 15 with referral_count >= 1
 *   { "action": "mine", "walletAddress": "<phantom>" } — your code + count
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (JWT verification OFF)
 */
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "Server misconfigured." }, 500);

  const supabase = createClient(url, key);
  const body = await req.json().catch(() => ({}));
  const action = (body.action ?? "").toString().trim();
  const walletAddress = (body.walletAddress ?? "").toString().trim();

  if (action === "leaderboard_referrals") {
    const { data, error } = await supabase
      .from("claimy_users")
      .select("username, referral_count")
      .gte("referral_count", 1)
      .order("referral_count", { ascending: false })
      .limit(15);

    if (error) {
      return json({ ok: false, error: error.message ?? "Leaderboard failed." }, 200);
    }

    /** Drop any row below 1 (numeric/string quirks, or stale Edge without .gte). */
    const rows = (data ?? [])
      .map((r: { username: string; referral_count: unknown }) => {
        const n = Number(r.referral_count);
        return {
          username: r.username,
          referralCount: Number.isFinite(n) ? n : 0,
        };
      })
      .filter((r) => r.referralCount >= 1);

    return json({ ok: true, rows });
  }

  if (action === "mine") {
    if (!walletAddress) return json({ ok: false, error: "walletAddress required." }, 400);

    const { data, error } = await supabase
      .from("claimy_users")
      .select("referral_code, referral_count")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (error) {
      return json({ ok: false, error: error.message ?? "Lookup failed." }, 200);
    }
    if (!data) {
      return json({ ok: false, error: "Account not found." }, 200);
    }

    return json({
      ok: true,
      referralCode: data.referral_code ?? null,
      referralCount: typeof data.referral_count === "number" ? data.referral_count : 0,
    });
  }

  return json({ ok: false, error: "Unknown action. Use: leaderboard_referrals | mine" }, 400);
});
