/**
 * Client-side checks matching `supabase/functions/blackjack-game/index.ts`
 * (HMAC-SHA256 Fisher–Yates shuffle, roll digest over full deck string).
 */

import type { VerificationComparison, VerificationResult } from '../flowerpoker/flowerpoker-provably-fair';

export type BlackjackFairSnapshot = {
  serverSeedHash: string;
  serverSeedReveal: string;
  clientSeed: string;
  rollDigest: string;
  shuffledDeckPreview?: string[];
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
  const msg = `claimy-bj|v1|${clientSeed}|${counter}`;
  const h = await hmacSha256(serverSecret, msg);
  const view = new DataView(h.buffer);
  return view.getUint32(0, false) >>> 0;
}

const SUITS = ['S', 'H', 'D', 'C'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

function freshDeck(): string[] {
  const d: string[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) d.push(`${s}${r}`);
  }
  return d;
}

async function shuffleDeck(serverSecret: Uint8Array, clientSeed: string, deck: string[]): Promise<string[]> {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const u = await deriveUint32(serverSecret, clientSeed, 3000 + i);
    const j = u % (i + 1);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function normHex(h: string): string {
  return h.trim().toLowerCase();
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Verify commit, shuffle digest, and (when provided) that the initial deal matches deck[0..3]
 * in server order: P0=deck[0], D0=deck[1], P1=deck[2], D1=deck[3].
 */
export async function verifyBlackjackRound(opts: {
  fairSnapshot: BlackjackFairSnapshot;
  playerCards?: string[];
  dealerCards?: string[];
}): Promise<VerificationResult> {
  const { fairSnapshot, playerCards, dealerCards } = opts;
  const comparisons: VerificationComparison[] = [];

  const reveal = (fairSnapshot.serverSeedReveal ?? '').trim();
  if (!reveal) {
    return {
      ok: false,
      summary: 'Server seed is only revealed after the hand settles.',
      comparisons: []
    };
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
  const deck = await shuffleDeck(secret, clientSeed, freshDeck());
  const deckStr = deck.join(',');
  const computedRollDigest = normHex(await sha256HexString(`${deckStr}|${clientSeed}`));
  const shownRollDigest = normHex(fairSnapshot.rollDigest ?? '');
  const digestMatch = computedRollDigest === shownRollDigest;
  comparisons.push({
    title: '2. Shuffled deck roll digest',
    leftCaption: 'Roll digest in round details',
    rightCaption: 'SHA-256 of shuffledDeck.join(",") | clientSeed',
    leftValue: shownRollDigest || '(empty)',
    rightValue: computedRollDigest,
    match: digestMatch,
    detail: 'Fisher–Yates with HMAC counters 3000+i matches blackjack-game Edge.'
  });
  if (!digestMatch) {
    return {
      ok: false,
      summary: 'Roll digest does not match the shuffled deck derived from your seeds.',
      comparisons
    };
  }

  const p = playerCards ?? [];
  const d = dealerCards ?? [];
  if (p.length >= 2 && d.length >= 2) {
    const p0 = p[0]!;
    const p1 = p[1]!;
    const d0 = d[0]!;
    const d1 = d[1]!;
    const holeHidden = d1 === '??';
    const dealMatch =
      deck[0] === p0 &&
      deck[1] === d0 &&
      deck[2] === p1 &&
      (holeHidden ? true : deck[3] === d1);
    comparisons.push({
      title: '3. Initial deal vs shuffled deck',
      leftCaption: 'First cards from deck[0..3] (server order)',
      rightCaption: 'Your first two player cards + dealer up + hole',
      leftValue: `${deck[0]}, ${deck[1]}, ${deck[2]}, ${deck[3]}`,
      rightValue: `${p0}, ${d0}, ${p1}, ${d1}`,
      match: dealMatch,
      detail: holeHidden
        ? 'Hole was hidden as ??; dealer hole matches deck[3] once revealed at settlement.'
        : 'Deal order: player, dealer up, player, dealer hole — same as server.'
    });
    if (!dealMatch) {
      return {
        ok: false,
        summary: 'Initial deal does not match the deterministic shuffle.',
        comparisons
      };
    }
  } else {
    comparisons.push({
      title: '3. Initial deal (skipped)',
      leftCaption: '—',
      rightCaption: '—',
      leftValue: 'Need at least two player and two dealer cards to check deal order.',
      rightValue: '—',
      match: true,
      detail: 'Hash and roll digest still verified above.'
    });
  }

  return {
    ok: true,
    summary: 'Checks passed: commit, shuffle roll digest, and (when possible) initial deal order.',
    comparisons
  };
}
