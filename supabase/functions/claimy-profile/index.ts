/**
 * Supabase Edge: claimy-profile
 * POST JSON:
 *   { "action": "set_games_client_seed", "walletAddress": "<phantom>", "gamesClientSeed": "<string|null|omit>" }
 * — empty string or null clears; max 128 chars trimmed.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
  const action = String(body.action ?? "").trim();
  const walletAddress = String(body.walletAddress ?? "").trim();

  if (!walletAddress) return json({ ok: false, error: "walletAddress required." }, 400);

  if (action === "set_games_client_seed") {
    const raw = body.gamesClientSeed;
    const clear = raw === null || raw === undefined || String(raw).trim() === "";
    let seed = clear ? "" : String(raw).trim();
    if (!clear && seed.length > 128) seed = seed.slice(0, 128);

    const { data: userRow, error: userErr } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (userErr || !userRow?.id) {
      return json({ ok: false, error: "Account not found." }, 200);
    }

    const value = clear ? null : seed;
    const { error: upErr } = await supabase
      .from("claimy_users")
      .update({ games_client_seed: value })
      .eq("id", userRow.id);

    if (upErr) return json({ ok: false, error: upErr.message ?? String(upErr) }, 200);

    return json({ ok: true, gamesClientSeed: value });
  }

  return json({ ok: false, error: "Unknown action. Use: set_games_client_seed" }, 400);
});
