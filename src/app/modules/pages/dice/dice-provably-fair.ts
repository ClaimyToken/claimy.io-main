/**
 * Client-side checks matching `supabase/functions/dice-game/index.ts`
 * (HMAC-SHA256 counter `claimy-dice|v1|<clientSeed>|0`, roll = uint32 % 10000).
 */

import type { VerificationComparison, VerificationResult } from '../flowerpoker/flowerpoker-provably-fair';

export type DiceFairSnapshot = {
  serverSeedHash: string;
  serverSeedReveal: string;
  clientSeed: string;
  rollDigest: string;
  roll?: number;
  mode?: string;
  target?: number;
  nonce?: number;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256HexString(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function deriveUint32(serverSecret: Uint8Array, clientSeed: string, counter: number): Promise<number> {
  const msg = `claimy-dice|v1|${clientSeed}|${counter}`;
  const h = await hmacSha256(serverSecret, msg);
  const view = new DataView(h.buffer);
  return view.getUint32(0, false) >>> 0;
}

function normHex(h: string): string {
  return h.trim().toLowerCase();
}

export async function verifyDiceRound(opts: {
  fairSnapshot: DiceFairSnapshot;
}): Promise<VerificationResult> {
  const { fairSnapshot } = opts;
  const comparisons: VerificationComparison[] = [];

  const reveal = (fairSnapshot.serverSeedReveal ?? '').trim();
  if (!reveal) {
    return {
      ok: false,
      summary: 'Server seed is only revealed after the roll settles.',
      comparisons
    };
  }

  let secretBytes: Uint8Array;
  try {
    secretBytes = base64ToBytes(reveal);
  } catch {
    return { ok: false, summary: 'Invalid base64 server seed.', comparisons };
  }

  const commitHash = normHex(fairSnapshot.serverSeedHash ?? '');
  const recomputedHash = normHex(await sha256Hex(secretBytes));
  comparisons.push({
    title: 'Server seed commitment',
    leftCaption: 'SHA-256(server seed)',
    leftValue: recomputedHash,
    rightCaption: 'Committed hash',
    rightValue: commitHash,
    match: recomputedHash === commitHash,
    detail: 'The revealed seed must match the pre-game hash.'
  });

  const clientSeed = String(fairSnapshot.clientSeed ?? '');
  const rollExpected = fairSnapshot.roll;
  const mode = String(fairSnapshot.mode ?? '');
  const target = fairSnapshot.target;
  if (typeof rollExpected !== 'number' || !Number.isInteger(rollExpected) || rollExpected < 0 || rollExpected > 9999) {
    return {
      ok: false,
      summary: 'Snapshot missing a valid roll (0–9999).',
      comparisons
    };
  }
  if (mode !== 'under' && mode !== 'over') {
    return { ok: false, summary: 'Snapshot missing mode (under / over).', comparisons };
  }
  if (typeof target !== 'number' || !Number.isInteger(target)) {
    return { ok: false, summary: 'Snapshot missing integer target.', comparisons };
  }

  const nonce = typeof fairSnapshot.nonce === 'number' ? fairSnapshot.nonce : 0;
  const derived = (await deriveUint32(secretBytes, clientSeed, nonce)) % 10000;
  comparisons.push({
    title: 'Roll from HMAC',
    leftCaption: 'Derived roll (uint32 % 10000)',
    leftValue: String(derived),
    rightCaption: 'Recorded roll',
    rightValue: String(rollExpected),
    match: derived === rollExpected
  });

  const digestExpected = normHex(fairSnapshot.rollDigest ?? '');
  const digestRe = normHex(await sha256HexString(`${rollExpected}|${mode}|${target}|${clientSeed}`));
  comparisons.push({
    title: 'Roll digest',
    leftCaption: 'SHA-256(roll|mode|target|clientSeed)',
    leftValue: digestRe,
    rightCaption: 'Stored digest',
    rightValue: digestExpected,
    match: digestRe === digestExpected
  });

  const ok = comparisons.every((c) => c.match);
  return {
    ok,
    summary: ok ? 'Dice round verifies — roll matches seeds and digest.' : 'One or more checks failed.',
    comparisons
  };
}
