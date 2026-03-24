/**
 * Supabase Edge: register-phantom
 * Verifies Phantom signMessage, creates custodial deposit wallet, inserts claimy_users.
 * Optional body.referralCode credits an existing user (referral_count +1).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEPOSIT_WALLET_ENCRYPTION_KEY (64 hex)
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nacl from "npm:tweetnacl@1.0.3";
import bs58 from "npm:bs58@5.0.0";
import { Keypair } from "npm:@solana/web3.js@1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseMessage(message: string) {
  const lines = message.split("\n").map((l) => l.trim());
  const get = (key: string) => {
    const found = lines.find((l) => l.toLowerCase().startsWith(`${key}:`));
    return found ? found.slice(key.length + 1).trim() : "";
  };
  return {
    username: get("username"),
    wallet: get("wallet"),
    nonce: get("nonce"),
    timestamp: get("timestamp"),
  };
}

function friendlyDbError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("claimy_users_wallet_address_key")) {
    return "That wallet is already linked to an account.";
  }
  if (m.includes("claimy_users_username_key")) {
    return "That username is already taken.";
  }
  if (m.includes("claimy_users_referral_code_key")) {
    return "Could not assign referral code. Please try again.";
  }
  if (m.includes("claimy_registration_nonces_pkey") || m.includes("duplicate key")) {
    return "This signature was already used. Please sign a new message.";
  }
  if (m.includes("violates unique constraint")) {
    return "That username or wallet is already registered.";
  }
  return "Something went wrong saving your account. Please try again.";
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").trim();
  if (clean.length !== 64) {
    throw new Error("DEPOSIT_WALLET_ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function encryptSecretKey(secretKey: Uint8Array, aesKey32: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    aesKey32,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, secretKey),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...combined));
}

const REF_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

async function allocateReferralCode(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    let code = "";
    for (let i = 0; i < 10; i++) {
      code += REF_ALPHABET[bytes[i]! % REF_ALPHABET.length];
    }
    const { data: clash } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();
    if (!clash) return code;
  }
  throw new Error("REFERRAL_CODE_ALLOC_FAILED");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const username = (body.username ?? "").toString().trim().toLowerCase();
  const walletAddress = (body.walletAddress ?? "").toString().trim();
  const message = (body.message ?? "").toString();
  const signatureBase64 = (body.signatureBase64 ?? "").toString();
  const referralCodeRaw = (body.referralCode ?? "").toString().trim().toLowerCase();

  if (!username || !walletAddress || !message || !signatureBase64) {
    return new Response(JSON.stringify({ error: "Missing required fields." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const parsed = parseMessage(message);
  if (!parsed.username || !parsed.wallet || !parsed.nonce || !parsed.timestamp) {
    return new Response(JSON.stringify({ error: "Signed message format invalid." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (parsed.username.toLowerCase() !== username) {
    return new Response(JSON.stringify({ error: "Username mismatch." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  if (parsed.wallet !== walletAddress) {
    return new Response(JSON.stringify({ error: "Wallet mismatch." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const ts = Date.parse(parsed.timestamp);
  if (!Number.isFinite(ts)) {
    return new Response(JSON.stringify({ error: "Invalid timestamp." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  const ageMs = Date.now() - ts;
  if (ageMs < 0 || ageMs > 10 * 60 * 1000) {
    return new Response(JSON.stringify({ error: "Signature expired. Sign again." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const sigBytes = b64decode(signatureBase64);
  const pubkeyBytes = bs58.decode(walletAddress);
  const msgBytes = new TextEncoder().encode(message);
  if (!nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes)) {
    return new Response(JSON.stringify({ error: "Invalid signature." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data: rowForName, error: nameErr } = await supabase
    .from("claimy_users")
    .select("wallet_address")
    .eq("username", username)
    .maybeSingle();
  if (nameErr) {
    return new Response(JSON.stringify({ error: "Could not verify username. Try again." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  if (rowForName && rowForName.wallet_address !== walletAddress) {
    return new Response(JSON.stringify({ error: "That username is already taken." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { error: delErr } = await supabase.from("claimy_users").delete().eq("wallet_address", walletAddress);
  if (delErr) {
    return new Response(JSON.stringify({ error: friendlyDbError(delErr.message) }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { error: nonceError } = await supabase.from("claimy_registration_nonces").insert({
    wallet_address: walletAddress,
    nonce: parsed.nonce,
  });
  if (nonceError) {
    return new Response(JSON.stringify({ error: friendlyDbError(nonceError.message) }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  let referrerId: string | null = null;
  if (referralCodeRaw.length >= 4) {
    const { data: refRow } = await supabase
      .from("claimy_users")
      .select("id")
      .eq("referral_code", referralCodeRaw)
      .maybeSingle();
    if (refRow?.id) referrerId = refRow.id as string;
  }

  const encKeyHex = Deno.env.get("DEPOSIT_WALLET_ENCRYPTION_KEY");
  if (!encKeyHex) {
    return new Response(JSON.stringify({ error: "Server configuration error." }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  let aesKey: Uint8Array;
  try {
    aesKey = hexToBytes(encKeyHex);
  } catch {
    return new Response(JSON.stringify({ error: "Server configuration error." }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const depositKeypair = Keypair.generate();
  const depositPub = depositKeypair.publicKey.toBase58();
  let encryptedSecret: string;
  try {
    encryptedSecret = await encryptSecretKey(depositKeypair.secretKey, aesKey);
  } catch {
    return new Response(JSON.stringify({ error: "Could not secure deposit wallet." }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  let newReferralCode: string;
  try {
    newReferralCode = await allocateReferralCode(supabase);
  } catch {
    return new Response(JSON.stringify({ error: "Could not allocate referral code." }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("claimy_users")
    .insert({
      username,
      wallet_address: walletAddress,
      deposit_wallet_public_key: depositPub,
      deposit_wallet_private_key_encrypted: encryptedSecret,
      referral_code: newReferralCode,
      referred_by_user_id: referrerId,
    })
    .select("created_at")
    .single();
  if (insertError) {
    return new Response(JSON.stringify({ error: friendlyDbError(insertError.message) }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (referrerId) {
    const { error: incErr } = await supabase.rpc("claimy_increment_referral_count", {
      p_user_id: referrerId,
    });
    if (incErr) {
      console.error("claimy_increment_referral_count failed", incErr.message);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      createdAt: inserted.created_at,
      depositAddress: depositPub,
      referralCode: newReferralCode,
    }),
    {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    },
  );
});
