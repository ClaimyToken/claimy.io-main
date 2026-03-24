/**
 * Client-side checks matching `supabase/functions/flowerpoker-game/index.ts`
 * (HMAC-SHA256, weighted flower picks, roll digest).
 */

export type FairSnapshot = {
  serverSeedHash: string;
  serverSeedReveal: string;
  clientSeed: string;
  subRoundIndex?: number;
  nonce?: number;
  rollDigest: string;
};

/** One row of “what the UI showed” vs “what your browser recomputed”. */
export type VerificationComparison = {
  title: string;
  leftCaption: string;
  rightCaption: string;
  leftValue: string;
  rightValue: string;
  match: boolean;
  /** Extra line (e.g. roll digest preimage). */
  detail?: string;
};

export type VerificationResult = {
  ok: boolean;
  summary: string;
  comparisons: VerificationComparison[];
};

const FLOWER_IDS = [
  'mixed',
  'red',
  'yellow',
  'blue',
  'orange',
  'purple',
  'assorted',
  'black',
  'white'
] as const;
const FLOWER_WEIGHTS = [150, 150, 150, 150, 150, 148, 100, 2, 1];
const TOTAL_WEIGHT = FLOWER_WEIGHTS.reduce((a, b) => a + b, 0);

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
  const msg = `claimy-fp|v1|${clientSeed}|${counter}`;
  const h = await hmacSha256(serverSecret, msg);
  const view = new DataView(h.buffer);
  return view.getUint32(0, false) >>> 0;
}

function pickFlower(u32: number): string {
  const x = (u32 / 0x1_0000_0000) * TOTAL_WEIGHT;
  let t = x;
  for (let i = 0; i < FLOWER_IDS.length; i++) {
    const w = FLOWER_WEIGHTS[i]!;
    if (t < w) return FLOWER_IDS[i]!;
    t -= w;
  }
  return FLOWER_IDS[0]!;
}

async function generateFullRound(
  serverSecret: Uint8Array,
  clientSeed: string,
  subRoundIndex: number
): Promise<{ player: string[]; house: string[] }> {
  const base = subRoundIndex * 40;
  const player: string[] = [];
  const house: string[] = [];
  for (let i = 0; i < 5; i++) {
    const u = await deriveUint32(serverSecret, clientSeed, base + i);
    player.push(pickFlower(u));
  }
  for (let i = 0; i < 5; i++) {
    const u = await deriveUint32(serverSecret, clientSeed, base + 10 + i);
    house.push(pickFlower(u));
  }
  return { player, house };
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function normHex(h: string): string {
  return h.trim().toLowerCase();
}

function formatFlowerRows(player: string[], house: string[]): string {
  return `Player: ${player.join(', ')}\nHouse:  ${house.join(', ')}`;
}

export async function verifyFlowerpokerRound(opts: {
  fairSnapshot: FairSnapshot;
  player: string[];
  house: string[];
}): Promise<VerificationResult> {
  const { fairSnapshot, player, house } = opts;
  const comparisons: VerificationComparison[] = [];

  const reveal = (fairSnapshot.serverSeedReveal ?? '').trim();
  if (!reveal) {
    return {
      ok: false,
      summary: 'Server seed is only revealed after the hand settles.',
      comparisons: []
    };
  }
  if (player.length !== 5 || house.length !== 5) {
    return { ok: false, summary: 'Need a full 5×5 round to verify.', comparisons: [] };
  }

  let secret: Uint8Array;
  try {
    secret = base64ToBytes(reveal);
  } catch {
    return { ok: false, summary: 'Invalid server seed (base64).', comparisons: [] };
  }

  const hashFromSecret = normHex(await sha256Hex(secret));
  const committedHash = normHex(fairSnapshot.serverSeedHash ?? '');
  const hashMatch = hashFromSecret === committedHash;
  comparisons.push({
    title: '1. Commit vs revealed seed',
    leftCaption: 'Hash in round details (committed before play)',
    rightCaption: 'SHA-256 of decoded server seed (this browser)',
    leftValue: committedHash || '(empty)',
    rightValue: hashFromSecret,
    match: hashMatch,
    detail:
      'The house could not change the seed after showing this hash: revealing the base64 seed must reproduce the same 64-character hex.'
  });
  if (!hashMatch) {
    return {
      ok: false,
      summary: 'The revealed server seed does not match the committed hash.',
      comparisons
    };
  }

  const clientSeed = String(fairSnapshot.clientSeed ?? '');
  const sub =
    typeof fairSnapshot.subRoundIndex === 'number' && Number.isFinite(fairSnapshot.subRoundIndex)
      ? fairSnapshot.subRoundIndex
      : typeof fairSnapshot.nonce === 'number' && Number.isFinite(fairSnapshot.nonce)
        ? fairSnapshot.nonce
        : 0;

  const derived = await generateFullRound(secret, clientSeed, sub);
  const rowsMatch =
    arraysEqual(derived.player, player) && arraysEqual(derived.house, house);
  comparisons.push({
    title: '2. Flowers vs HMAC derivation',
    leftCaption: 'Flowers on the board (this round)',
    rightCaption: 'Derived from HMAC-SHA256(secret, claimy-fp|v1|clientSeed|counter)',
    leftValue: formatFlowerRows(player, house),
    rightValue: formatFlowerRows(derived.player, derived.house),
    match: rowsMatch,
    detail: `Sub-round index ${sub}. Each of 10 flowers uses counters sub×40 + slot (same formula as the server).`
  });
  if (!rowsMatch) {
    return {
      ok: false,
      summary: 'Flowers derived from the seed do not match the board.',
      comparisons
    };
  }

  const preimage = `${player.join(',')}|${house.join(',')}|${sub}|${clientSeed}`;
  const computedRollDigest = normHex(await sha256HexString(preimage));
  const shownRollDigest = normHex(fairSnapshot.rollDigest ?? '');
  const digestMatch = computedRollDigest === shownRollDigest;
  comparisons.push({
    title: '3. Roll digest',
    leftCaption: 'Roll digest in round details',
    rightCaption: 'SHA-256 of preimage (this browser)',
    leftValue: shownRollDigest || '(empty)',
    rightValue: computedRollDigest,
    match: digestMatch,
    detail: `Preimage hashed: ${preimage}`
  });
  if (!digestMatch) {
    return {
      ok: false,
      summary: 'Roll digest does not match the commitment string.',
      comparisons
    };
  }

  return {
    ok: true,
    summary: 'All three checks match: commit, HMAC flowers, and roll digest.',
    comparisons
  };
}
