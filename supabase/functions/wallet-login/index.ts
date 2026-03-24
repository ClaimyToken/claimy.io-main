/**
 * Supabase Edge: wallet-login
 * Looks up claimy_users by Phantom wallet_address (JWT verification OFF).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const walletAddress = (body.walletAddress ?? "").toString().trim();

  if (!walletAddress) {
    return new Response(JSON.stringify({ error: "Wallet address is required." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("claimy_users")
    .select("username, created_at, deposit_wallet_public_key, referral_code, referral_count, games_client_seed")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "Could not look up account. Try again." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (data === null) {
    return new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      found: true,
      username: data.username,
      createdAt: data.created_at,
      depositAddress: data.deposit_wallet_public_key ?? null,
      referralCode: data.referral_code ?? null,
      referralCount: typeof data.referral_count === "number" ? data.referral_count : 0,
      gamesClientSeed: (data as { games_client_seed?: string | null }).games_client_seed ?? null,
    }),
    {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    },
  );
});
