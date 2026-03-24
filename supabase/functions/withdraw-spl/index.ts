/**
 * Supabase Edge Function: withdraw-spl
 * Verifies Phantom signMessage, then sends SPL to the user’s ATA using either:
 *
 * 1) **Simple vault (recommended for prototyping):** `CLAIMY_SIMPLE_VAULT_PRIVATE_KEY` — a funded wallet
 *    (SOL for fees + SPL ATA for CLAIMY_SPL_MINT). Standard SPL transfer; no Anchor program.
 * 2) **PDA vault:** `CLAIMY_VAULT_PROGRAM_ID` + `CLAIMY_RELAYER_PRIVATE_KEY` — `claimy_vault::withdraw_to_user`
 *    (see `programs/claimy-vault`). If `CLAIMY_SIMPLE_VAULT_PRIVATE_KEY` is set, it takes precedence.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLAIMY_SPL_MINT, SOLANA_RPC_URL,
 *          plus either (1) CLAIMY_SIMPLE_VAULT_PRIVATE_KEY or (2) CLAIMY_VAULT_PROGRAM_ID + CLAIMY_RELAYER_PRIVATE_KEY
 * Optional: **CLAIMY_SPL_DECIMALS** — set (e.g. `9`) to skip `getMint` over RPC (avoids failures when RPC is slow,
 *   rate-limited, or mint is on a different cluster than `SOLANA_RPC_URL`). Must match the mint’s on-chain decimals
 *   or raw transfer amounts will be wrong. Before sending on-chain, the function checks **claimy_get_playable_balance**
 *   so withdrawals cannot exceed Claimy Credits (the UI alone is not authoritative).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nacl from "npm:tweetnacl@1.0.3";
import bs58 from "npm:bs58@5.0.0";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "npm:@solana/web3.js@1.95.4";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "npm:@solana/spl-token@0.4.9";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Anchor `sha256("global:withdraw_to_user")[0..8]` */
const WITHDRAW_IX_DISC = new Uint8Array([0x35, 0xc3, 0x0c, 0x46, 0xbd, 0xbb, 0x5d, 0x5c]);

const te = new TextEncoder();
const STATE_SEED = te.encode("state");
const VAULT_SEED = te.encode("vault");

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseWithdrawMessage(message: string) {
  const lines = message.split("\n").map((l) => l.trim());
  const get = (key: string) => {
    const found = lines.find((l) => l.toLowerCase().startsWith(`${key}:`));
    return found ? found.slice(key.length + 1).trim() : "";
  };
  return {
    header: lines[0] ?? "",
    username: get("username").toLowerCase(),
    wallet: get("wallet"),
    amount: get("amount"),
    mint: get("mint"),
    nonce: get("nonce"),
    timestamp: get("timestamp"),
  };
}

function loadRelayerKeypair(raw: string): Keypair {
  const t = raw.trim();
  if (t.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(t)));
  }
  return Keypair.fromSecretKey(bs58.decode(t));
}

/** Human decimal string → raw token amount (smallest units). */
function toRawAmount(amountStr: string, decimals: number): bigint {
  const s = amountStr.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("INVALID_AMOUNT");
  const [intPart, fracPart = ""] = s.split(".");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) throw new Error("INVALID_AMOUNT");
  if (fracPart.length > decimals) throw new Error("TOO_MANY_DECIMALS");
  const frac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const hi = BigInt(intPart || "0");
  const lo = BigInt(frac || "0");
  return hi * (10n ** BigInt(decimals)) + lo;
}

function u64Le(n: bigint): Uint8Array {
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error("U64_OVERFLOW");
  const out = new Uint8Array(8);
  let x = n;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Debit playable balance + append `claimy_credit_ledger` after a confirmed on-chain withdraw. */
async function recordWithdrawInLedger(
  supabase: ReturnType<typeof createClient>,
  walletAddress: string,
  amountUiStr: string,
  txSignature: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const n = parseFloat(amountUiStr.trim());
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: "INVALID_WITHDRAW_AMOUNT_FOR_LEDGER" };
  }
  const { error } = await supabase.rpc("claimy_apply_credit_delta", {
    p_wallet: walletAddress,
    p_delta: -n,
    p_entry_type: "withdraw",
    p_ref: txSignature.length > 512 ? txSignature.slice(0, 512) : txSignature,
  });
  if (error) {
    return { ok: false, message: error.message ?? String(error) };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const walletAddress = (body.walletAddress ?? "").toString().trim();
  const message = (body.message ?? "").toString();
  const signatureBase64 = (body.signatureBase64 ?? "").toString();
  const amount = (body.amount ?? "").toString().trim();
  /** Optional; must match `mint:` in the signed message if both are present. */
  const bodyMint = (body.mint ?? "").toString().trim();

  if (!walletAddress || !message || !signatureBase64 || !amount) {
    return new Response(JSON.stringify({ ok: false, error: "Missing required fields." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const parsed = parseWithdrawMessage(message);
  if (!parsed.username || !parsed.wallet || !parsed.amount || !parsed.nonce || !parsed.timestamp) {
    return new Response(JSON.stringify({ ok: false, error: "Signed message format invalid." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (parsed.header !== "CLAIMY SPL withdraw") {
    return new Response(JSON.stringify({ ok: false, error: "Invalid withdraw message header." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (parsed.wallet !== walletAddress) {
    return new Response(JSON.stringify({ ok: false, error: "Wallet mismatch." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (parsed.amount !== amount) {
    return new Response(JSON.stringify({ ok: false, error: "Amount mismatch." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const ts = Date.parse(parsed.timestamp);
  if (!Number.isFinite(ts)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid timestamp." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  const ageMs = Date.now() - ts;
  if (ageMs < 0 || ageMs > 10 * 60 * 1000) {
    return new Response(JSON.stringify({ ok: false, error: "Signature expired. Sign again." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const envMint = (Deno.env.get("CLAIMY_SPL_MINT") ?? "").trim();
  if (envMint && parsed.mint !== envMint) {
    return new Response(JSON.stringify({ ok: false, error: "Mint mismatch." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  let sigBytes: Uint8Array;
  let pubkeyBytes: Uint8Array;
  try {
    sigBytes = b64decode(signatureBase64);
    pubkeyBytes = bs58.decode(walletAddress);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid signature encoding." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const msgBytes = new TextEncoder().encode(message);
  if (!nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid signature." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data: row, error: rowErr } = await supabase
    .from("claimy_users")
    .select("username, wallet_address, deposit_wallet_public_key")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (rowErr || !row) {
    return new Response(JSON.stringify({ ok: false, error: "Account not found." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (row.username.toLowerCase() !== parsed.username) {
    return new Response(JSON.stringify({ ok: false, error: "Username mismatch." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (!row.deposit_wallet_public_key) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: "No custodial deposit wallet on this account.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  const requestedUi = parseFloat(parsed.amount.trim());
  if (!Number.isFinite(requestedUi) || requestedUi <= 0) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid withdraw amount." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  const { data: playableData, error: playableErr } = await supabase.rpc("claimy_get_playable_balance", {
    p_wallet: walletAddress,
  });
  if (playableErr) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: playableErr.message ?? "Could not read Claimy Credits balance.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }
  const playable =
    typeof playableData === "number" ? playableData : parseFloat(String(playableData ?? ""));
  if (!Number.isFinite(playable)) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: "Invalid Claimy Credits balance.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }
  if (requestedUi > playable + 1e-8) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: "Withdrawal amount exceeds your Claimy Credits balance.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  if (bodyMint && parsed.mint && bodyMint !== parsed.mint) {
    return new Response(JSON.stringify({ ok: false, error: "Mint in request does not match signed message." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const rpcUrl = (Deno.env.get("SOLANA_RPC_URL") ?? "").trim();
  const mintStr = (envMint || parsed.mint || bodyMint).trim();
  const simpleVaultSecret = (Deno.env.get("CLAIMY_SIMPLE_VAULT_PRIVATE_KEY") ?? "").trim();
  const programIdStr = (Deno.env.get("CLAIMY_VAULT_PROGRAM_ID") ?? "").trim();
  const relayerSecret = (Deno.env.get("CLAIMY_RELAYER_PRIVATE_KEY") ?? "").trim();

  const useSimpleVault = simpleVaultSecret.length > 0;
  const usePdaVault = programIdStr.length > 0 && relayerSecret.length > 0;

  if (!rpcUrl) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error:
          "Solana RPC is not configured on the server. Add the SOLANA_RPC_URL secret to the withdraw-spl Edge Function (same RPC URL as claimy-credits).",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  if (!mintStr || mintStr === "(not configured)") {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error:
          "Token mint is not configured. Set CLAIMY_SPL_MINT on withdraw-spl, or send a signed message that includes a valid mint: line (and optionally the mint field in the JSON body).",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  if (!useSimpleVault && !usePdaVault) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error:
          "Withdraw vault not configured: set CLAIMY_SIMPLE_VAULT_PRIVATE_KEY (hot wallet with SPL + SOL for fees), or set CLAIMY_VAULT_PROGRAM_ID and CLAIMY_RELAYER_PRIVATE_KEY for the Anchor PDA vault.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  let rawAmount: bigint;
  let connection: Connection;
  let mintPk: PublicKey;
  let userPubkey: PublicKey;

  try {
    connection = new Connection(rpcUrl, "confirmed");
    mintPk = new PublicKey(mintStr);
    userPubkey = new PublicKey(walletAddress);
  } catch (e) {
    const m = e instanceof Error ? e.message : "config";
    return new Response(
      JSON.stringify({ ok: false, signatureValid: true, error: `Invalid server Solana config: ${m}` }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  const decimalsEnv = (Deno.env.get("CLAIMY_SPL_DECIMALS") ?? "").trim();
  let decimals: number | undefined;
  const formatErr = (e: unknown) => {
    if (e instanceof Error) {
      const m = e.message?.trim();
      if (m) return m;
      return `${e.name || "Error"}${e.cause != null ? ` (${String(e.cause)})` : ""}`;
    }
    if (typeof e === "string" && e.trim()) return e.trim();
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  };
  const decimalsHint =
    " Set CLAIMY_SPL_DECIMALS in Edge secrets (e.g. 9 for standard SPL) to skip fetching the mint account over RPC.";
  try {
    if (decimalsEnv !== "") {
      decimals = parseInt(decimalsEnv, 10);
      if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) throw new Error("bad decimals");
    } else {
      try {
        const mintInfo = await getMint(connection, mintPk);
        decimals = mintInfo.decimals;
      } catch (ge) {
        const detail = formatErr(ge);
        const invalidMintHint =
          /TokenInvalidAccountOwnerError|InvalidAccountOwner/i.test(detail)
            ? " Usually the mint address does not exist on this RPC network (mainnet vs devnet mismatch), or the address is not the SPL mint."
            : "";
        throw new Error(
          detail
            ? `getMint failed: ${detail}.${invalidMintHint}${decimalsHint}`
            : `getMint failed (no detail from RPC).${decimalsHint}`,
        );
      }
    }
    rawAmount = toRawAmount(parsed.amount, decimals);
  } catch (e) {
    const msg = e instanceof Error ? e.message : formatErr(e);
    if (msg === "INVALID_AMOUNT") {
      return new Response(JSON.stringify({ ok: false, signatureValid: true, error: "Invalid withdrawal amount." }), {
        status: 400,
        headers: { ...cors, "content-type": "application/json" },
      });
    }
    if (msg === "TOO_MANY_DECIMALS") {
      const d = typeof decimals === "number" ? decimals : (decimalsEnv || "?");
      return new Response(
        JSON.stringify({
          ok: false,
          signatureValid: true,
          error: `Too many decimal places for this token (max ${d}).`,
        }),
        { status: 400, headers: { ...cors, "content-type": "application/json" } },
      );
    }
    const out =
      msg && msg.trim()
        ? `Could not read mint decimals: ${msg}`
        : `Could not read mint decimals (unknown error).${decimalsHint}`;
    return new Response(JSON.stringify({ ok: false, signatureValid: true, error: out }), {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  if (rawAmount === 0n) {
    return new Response(JSON.stringify({ ok: false, signatureValid: true, error: "Amount must be greater than zero." }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  /** Legacy Token vs Token-2022 — ATA addresses differ; must match mint’s on-chain owner program. */
  const mintAccountInfo = await connection.getAccountInfo(mintPk);
  if (!mintAccountInfo) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: "Mint account not found on this RPC (check CLAIMY_SPL_MINT matches SOLANA_RPC_URL cluster).",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }
  const tokenProgramId = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;

  const userTokenAccount = getAssociatedTokenAddressSync(mintPk, userPubkey, false, tokenProgramId);

  const userAtaInfo = await connection.getAccountInfo(userTokenAccount);
  if (!userAtaInfo) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error:
          "No token account for this mint on your Phantom wallet (withdraw destination). If you use Token-2022, this check now uses the correct program — retry. Otherwise receive a small amount of Claimy on this wallet once to create the account.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  /** SPL transfer from a hot wallet (mint ATA + SOL in same wallet). Takes precedence over PDA vault. */
  if (useSimpleVault) {
    let vaultKp: Keypair;
    try {
      vaultKp = loadRelayerKeypair(simpleVaultSecret);
    } catch (e) {
      const m = e instanceof Error ? e.message : "key";
      return new Response(
        JSON.stringify({
          ok: false,
          signatureValid: true,
          error: `Invalid CLAIMY_SIMPLE_VAULT_PRIVATE_KEY: ${m}`,
        }),
        { status: 200, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const vaultSourceAta = getAssociatedTokenAddressSync(mintPk, vaultKp.publicKey, false, tokenProgramId);
    let vaultBalance: bigint;
    try {
      const va = await getAccount(connection, vaultSourceAta, undefined, tokenProgramId);
      if (!va.mint.equals(mintPk)) {
        return new Response(
          JSON.stringify({
            ok: false,
            signatureValid: true,
            error: "Simple vault token account mint does not match CLAIMY_SPL_MINT.",
          }),
          { status: 200, headers: { ...cors, "content-type": "application/json" } },
        );
      }
      vaultBalance = va.amount;
    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          signatureValid: true,
          error:
            "Simple vault has no SPL token account for this mint. Send Claimy SPL to this wallet’s associated token account (same mint as the app), and ensure the wallet holds SOL for fees.",
        }),
        { status: 200, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    if (vaultBalance < rawAmount) {
      return new Response(
        JSON.stringify({
          ok: false,
          signatureValid: true,
          error: "Not enough Claimy in the vault wallet for this withdrawal.",
        }),
        { status: 200, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const { error: nonceErrSimple } = await supabase.from("claimy_withdraw_nonces").insert({
      wallet_address: walletAddress,
      nonce: parsed.nonce,
    });
    if (nonceErrSimple) {
      const replay =
        nonceErrSimple.message?.includes("duplicate") ||
        nonceErrSimple.message?.includes("claimy_withdraw_nonces_pkey");
      return new Response(
        JSON.stringify({
          ok: false,
          signatureValid: true,
          error: replay ? "This withdraw request was already submitted." : "Could not record withdraw nonce.",
        }),
        { status: 400, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const transferIx = createTransferInstruction(
      vaultSourceAta,
      userTokenAccount,
      vaultKp.publicKey,
      rawAmount,
      [],
      tokenProgramId,
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const txSimple = new Transaction({
      feePayer: vaultKp.publicKey,
      recentBlockhash: blockhash,
    });
    txSimple.add(transferIx);
    txSimple.sign(vaultKp);

    let signature: string;
    try {
      signature = await connection.sendRawTransaction(txSimple.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (e) {
      const logs = e && typeof e === "object" && "logs" in e ? (e as { logs?: string[] }).logs : undefined;
      const detail = e instanceof Error ? e.message : String(e);
      return new Response(
        JSON.stringify({
          ok: false,
          signatureValid: true,
          error: `On-chain withdraw failed: ${detail}`,
          logs: logs?.slice?.(-20),
        }),
        { status: 200, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const ledgerResult = await recordWithdrawInLedger(supabase, walletAddress, parsed.amount, signature);
    const simplePayload: Record<string, unknown> = { ok: true, signature, withdrawMode: "simple" };
    if (!ledgerResult.ok) {
      simplePayload.ledgerError = ledgerResult.message;
    }
    return new Response(JSON.stringify(simplePayload), {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  let relayer: Keypair;
  let programId: PublicKey;
  try {
    relayer = loadRelayerKeypair(relayerSecret);
    programId = new PublicKey(programIdStr);
  } catch (e) {
    const m = e instanceof Error ? e.message : "config";
    return new Response(
      JSON.stringify({ ok: false, signatureValid: true, error: `Invalid PDA vault config: ${m}` }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  const [vaultState] = PublicKey.findProgramAddressSync([STATE_SEED, mintPk.toBytes()], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([VAULT_SEED, mintPk.toBytes()], programId);
  const vaultTokenAccount = getAssociatedTokenAddressSync(mintPk, vaultAuthority, true, tokenProgramId);

  const vaultInfo = await connection.getAccountInfo(vaultTokenAccount);
  if (!vaultInfo) {
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: "Vault token account missing. Initialize the claimy-vault program for this mint.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  /** After all preflight: reserve nonce so the same signed payload cannot be submitted in parallel. */
  const { error: nonceErr } = await supabase.from("claimy_withdraw_nonces").insert({
    wallet_address: walletAddress,
    nonce: parsed.nonce,
  });
  if (nonceErr) {
    const replay =
      nonceErr.message?.includes("duplicate") || nonceErr.message?.includes("claimy_withdraw_nonces_pkey");
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: replay ? "This withdraw request was already submitted." : "Could not record withdraw nonce.",
      }),
      { status: 400, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  const ixData = concatBytes(WITHDRAW_IX_DISC, u64Le(rawAmount));

  const keys = [
    { pubkey: vaultState, isSigner: false, isWritable: false },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userPubkey, isSigner: false, isWritable: false },
    { pubkey: mintPk, isSigner: false, isWritable: false },
    { pubkey: relayer.publicKey, isSigner: true, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
  ];

  const withdrawIx = new TransactionInstruction({
    keys,
    programId,
    data: ixData,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: relayer.publicKey,
    recentBlockhash: blockhash,
  });
  tx.add(withdrawIx);
  tx.sign(relayer);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
  } catch (e) {
    const logs = e && typeof e === "object" && "logs" in e ? (e as { logs?: string[] }).logs : undefined;
    const detail = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({
        ok: false,
        signatureValid: true,
        error: `On-chain withdraw failed: ${detail}`,
        logs: logs?.slice?.(-20),
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  const pdaLedger = await recordWithdrawInLedger(supabase, walletAddress, parsed.amount, signature);
  const pdaPayload: Record<string, unknown> = { ok: true, signature, withdrawMode: "pda" };
  if (!pdaLedger.ok) {
    pdaPayload.ledgerError = pdaLedger.message;
  }
  return new Response(JSON.stringify(pdaPayload), {
    status: 200,
    headers: { ...cors, "content-type": "application/json" },
  });
});
