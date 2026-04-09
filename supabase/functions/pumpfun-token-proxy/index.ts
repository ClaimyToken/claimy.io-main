/**
 * GET /pumpfun-token-proxy?mint=<base58>&sync=true
 * Proxies pump.fun Frontend API v3 `GET /coins/{mint}` with Origin https://pump.fun
 * (required — direct browser calls from other origins get 403).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const u = new URL(req.url);
  const mint = (u.searchParams.get("mint") ?? "").trim();
  if (!mint || mint.length < 32 || mint.length > 64) {
    return new Response(JSON.stringify({ error: "Invalid mint" }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const syncParam = u.searchParams.get("sync");
  const sync = syncParam === null || syncParam === "" || syncParam === "true";
  const pumpUrl =
    `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}?sync=${sync}`;

  const r = await fetch(pumpUrl, {
    headers: {
      Accept: "application/json",
      Origin: "https://pump.fun",
    },
  });

  const body = await r.text();
  const ct = r.headers.get("content-type") ?? "application/json";
  return new Response(body, { status: r.status, headers: { ...cors, "content-type": ct } });
});
