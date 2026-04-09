# Supabase: Phantom-only registration

The app expects **five Edge Functions** for registration, login, linked-wallet refresh, and signed withdraw intents (no JWT required on the functions):

1. `check-username` — `POST { "username": "alice", "walletAddress"?: "<optional phantom pubkey>" }` → `{ "available": true | false }` (if the username is yours, pass `walletAddress` so you can re-register after connecting Phantom)
2. `register-phantom` — verifies Ed25519 signature, generates a **custodial Solana deposit wallet** (private key encrypted with `DEPOSIT_WALLET_ENCRYPTION_KEY`), inserts the row, returns `{ "ok": true, "createdAt": "<ISO>", "depositAddress": "<base58>" }`
3. `wallet-login` — `POST { "walletAddress": "<phantom pubkey>" }` → `{ "found": true, "username": "...", "createdAt": "<ISO>", "depositAddress": "<base58>" | null }` or `{ "found": false }` (`depositAddress` = `claimy_users.deposit_wallet_public_key`; never returns the private key)
4. `account-linked-wallet` — `POST { "walletAddress": "<phantom pubkey>" }` → `{ "ok": true, "registrationWallet": "<same as wallet_address>", "username": "..." }` so the **Your wallet** modal can re-fetch the registration wallet from Supabase (must match the session Phantom)
5. `withdraw-spl` — `POST { "walletAddress", "message", "signatureBase64", "amount" }` — verifies Ed25519, user row, preflights vault/user ATAs, records nonce, submits **`claimy_vault::withdraw_to_user`** (see repo `supabase/functions/withdraw-spl/index.ts`). Returns `{ "ok": true, "signature": "<tx_sig>" }` on success or `{ "ok": false, "signatureValid": true, "error": "..." }` when the signature is valid but the chain or config failed

**Vault withdrawals (PDA):** the repo includes an Anchor program `programs/claimy-vault` plus **`CLAIMY_VAULT.md`** — relayer-signed `withdraw_to_user` moves SPL from the vault ATA to the user’s ATA. Extend `withdraw-spl` (or a worker) to build and submit that transaction after verification; keep relayer keys only in Edge secrets.

Use **one table** for registered users. You can start fresh: drop old tables if you want, then run the SQL below.

---

## 1) SQL (Dashboard → SQL → New query → Run)

```sql
-- Optional: remove old experiments
-- drop table if exists public.claimy_registration_nonces cascade;
-- drop table if exists public.claimy_users cascade;

create extension if not exists "pgcrypto";

create table if not exists public.claimy_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  wallet_address text not null unique,
  created_at timestamptz not null default now(),
  deposit_wallet_public_key text,
  deposit_wallet_private_key_encrypted text
);

create table if not exists public.claimy_registration_nonces (
  wallet_address text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, nonce)
);

-- One row per (wallet, nonce) for signed withdraw intents (prevents replay)
create table if not exists public.claimy_withdraw_nonces (
  wallet_address text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, nonce)
);

alter table public.claimy_users enable row level security;
alter table public.claimy_registration_nonces enable row level security;
alter table public.claimy_withdraw_nonces enable row level security;
-- No policies for anon: only Edge Functions (service role) write/read as needed.

-- Uniqueness for deposit addresses (multiple NULLs allowed in Postgres)
create unique index if not exists claimy_users_deposit_wallet_public_key_key
  on public.claimy_users (deposit_wallet_public_key)
  where deposit_wallet_public_key is not null;
```

**If `claimy_users` already existed** from an older setup, add columns + index (safe to re-run):

```sql
alter table public.claimy_users
  add column if not exists deposit_wallet_public_key text;

alter table public.claimy_users
  add column if not exists deposit_wallet_private_key_encrypted text;

create unique index if not exists claimy_users_deposit_wallet_public_key_key
  on public.claimy_users (deposit_wallet_public_key)
  where deposit_wallet_public_key is not null;
```

**If you already ran an older SQL script** without withdraw nonces, add the table (safe to re-run):

```sql
create table if not exists public.claimy_withdraw_nonces (
  wallet_address text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, nonce)
);
alter table public.claimy_withdraw_nonces enable row level security;
```

`username` should store **lowercase** (the app sends lowercase).

**Dev only — wipe all registrations (SQL Editor):**

```sql
delete from public.claimy_registration_nonces;
delete from public.claimy_withdraw_nonces;
delete from public.claimy_users;
```

---

## 2) Secrets (Dashboard → Edge Functions → Secrets)

Set:

- `SUPABASE_URL` = `https://mosmjagamrtsyeoohcty.supabase.co` (or your project URL)
- `SUPABASE_SERVICE_ROLE_KEY` = **service_role** key from **Project Settings → API** (never put this in the frontend)
- `DEPOSIT_WALLET_ENCRYPTION_KEY` = **64 hex characters** (32 bytes) used only by `register-phantom` to AES-GCM–encrypt custodial keypair secrets. Generate locally, e.g. `openssl rand -hex 32` — store in **Edge Functions → Secrets**, never in the frontend.

---

## 3) Edge Function: `check-username`

Create function **slug** exactly: `check-username`  
Paste (Deno):

```ts
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
  const username = (body.username ?? "").toString().trim().toLowerCase();
  const walletAddress = (body.walletAddress ?? "").toString().trim();

  if (username.length < 3 || username.length > 24) {
    return new Response(JSON.stringify({ error: "Username must be 3-24 characters." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("claimy_users")
    .select("wallet_address")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "Could not check username. Try again." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  // Available if unused, or same wallet re-registering (replace row on register)
  const available =
    data === null ||
    (walletAddress.length > 0 && data.wallet_address === walletAddress);
  return new Response(JSON.stringify({ available }), {
    status: 200,
    headers: { ...cors, "content-type": "application/json" },
  });
});
```

**Settings:** turn **JWT verification OFF** for this function (public check).

---

## 4) Edge Function: `register-phantom`

Create function **slug** exactly: `register-phantom`  
Paste (Deno) — verifies the Phantom (Ed25519) signature, prevents nonce replay, then inserts:

```ts
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

  const { data: inserted, error: insertError } = await supabase
    .from("claimy_users")
    .insert({
      username,
      wallet_address: walletAddress,
      deposit_wallet_public_key: depositPub,
      deposit_wallet_private_key_encrypted: encryptedSecret,
    })
    .select("created_at")
    .single();
  if (insertError) {
    return new Response(JSON.stringify({ error: friendlyDbError(insertError.message) }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      createdAt: inserted.created_at,
      depositAddress: depositPub,
    }),
    {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    },
  );
});
```

**Settings:** JWT verification **OFF** for this function too.

---

## 5) Edge Function: `wallet-login`

Create function **slug** exactly: `wallet-login`  
Looks up `claimy_users` by `wallet_address` (no signature required for this step—wallet was already connected in the browser).

Paste (Deno):

```ts
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
    .select("username, created_at, deposit_wallet_public_key")
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
    }),
    {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    },
  );
});
```

**Settings:** JWT verification **OFF**.

---

## 6) Edge Function: `account-linked-wallet`

Create function **slug** exactly: `account-linked-wallet`  
Used by the **Your wallet** modal so users can **Verify** that the Phantom address shown still matches `claimy_users.wallet_address` for their session (read from DB with the service role).

Paste (Deno):

```ts
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
    return new Response(JSON.stringify({ ok: false, error: "Wallet address is required." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("claimy_users")
    .select("username, wallet_address")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: "Could not load account." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (data === null) {
    return new Response(JSON.stringify({ ok: false, error: "No account for this wallet." }), {
      status: 404,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      registrationWallet: data.wallet_address,
      username: data.username,
    }),
    { status: 200, headers: { ...cors, "content-type": "application/json" } },
  );
});
```

**Settings:** JWT verification **OFF**.

---

## 7) Edge Function: `withdraw-spl`

Create function **slug** exactly: `withdraw-spl`.

**Source of truth:** copy the full file from the repo into the Supabase editor (or deploy with CLI):

`supabase/functions/withdraw-spl/index.ts`

It verifies the same Phantom **signMessage** payload as before, then submits a Solana transaction using **one of two backends**:

1. **Simple vault (hot wallet)** — recommended to ship quickly: set **`CLAIMY_SIMPLE_VAULT_PRIVATE_KEY`**. The server sends a normal SPL **transfer** from that wallet’s token account for `CLAIMY_SPL_MINT` to the user’s ATA. That wallet must hold **SOL** (fees) and **Claimy SPL** (liquidity). If this secret is set, it **overrides** the PDA path.
2. **PDA program** — set **`CLAIMY_VAULT_PROGRAM_ID`** + **`CLAIMY_RELAYER_PRIVATE_KEY`** and deploy **`claimy-vault`** (see `programs/claimy-vault` and `CLAIMY_VAULT.md`). Calls **`withdraw_to_user`**.

You must configure **either** (1) **or** (2), plus RPC + mint. See also **`docs/SIMPLE_VAULT_WITHDRAW.md`**.

### Edge Function secrets (add in Dashboard)

| Secret | Required | Description |
|--------|----------|-------------|
| `SUPABASE_URL` | Yes | Same as other functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same as other functions |
| `CLAIMY_SPL_MINT` | Yes | Must match signed message + on-chain mint |
| `SOLANA_RPC_URL` | Yes | HTTPS RPC (e.g. Shyft / Helius) |
| `CLAIMY_SIMPLE_VAULT_PRIVATE_KEY` | One mode | Base58 **64-byte secret** or JSON `[...]` — wallet that holds Claimy SPL + SOL; enables **simple** withdrawals |
| `CLAIMY_VAULT_PROGRAM_ID` | Other mode | Deployed `claimy_vault` program id (omit if using simple vault only) |
| `CLAIMY_RELAYER_PRIVATE_KEY` | Other mode | Base58 or JSON — must match on-chain `VaultState.relayer` when using PDA vault |
| `CLAIMY_SPL_DECIMALS` | No | If set, skips `getMint` RPC (e.g. `9`) |

**Settings:** JWT verification **OFF**.

**Behavior notes**

- Nonce is inserted **after** vault/user ATA checks and **immediately before** `sendRawTransaction`, so a bad config does not consume nonces. If the transaction **fails** after the nonce is written, the user must **sign a new message** (new nonce) to retry.
- **Simple vault:** the hot wallet pays fees and signs the SPL transfer.
- **PDA vault:** relayer pays fees and signs the program instruction.
- User must already have an **ATA** for the Claimy mint (e.g. received the token once in Phantom).

**Deposits:** the app reads **Claimy Credits** from each user’s **custodial deposit wallet** SPL balance over RPC (`ClaimyCreditsService`). Sending Claimy SPL to that address updates the balance on refresh — no sweep to the vault wallet is required for the UI to reflect deposits.

---

## 8) Quick test (browser or curl)

Check username:

```bash
curl -s -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/check-username" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser"}'
```

Expect: `{"available":true}` or `{"available":false}`

---

## 9) Frontend

The Angular app calls:

- `.../functions/v1/check-username`
- `.../functions/v1/register-phantom`
- `.../functions/v1/wallet-login`
- `.../functions/v1/account-linked-wallet` (wallet modal — **Verify**)
- `.../functions/v1/withdraw-spl` (wallet modal — sign & request withdraw)

Endpoints are built from `ConfigService.supabaseUrl` in `claimy-edge.service.ts`. If your slugs differ, update that service or your Supabase function names.
