import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';

/** Row from `claimy_credit_ledger` (via claimy-credits `list_ledger`). */
export type ClaimyCreditLedgerRow = {
  id: string;
  entry_type: string;
  amount_delta: number | string;
  balance_after: number | string;
  ref: string | null;
  metadata: unknown;
  created_at: string;
};

export type FlowerpokerRoundProof = {
  player: string[];
  house: string[];
};

/** Snapshot stored in `claimy_game_sessions.metadata.currentRound` for refresh-safe play. */
export type FlowerpokerPersistedRound = {
  player: string[];
  house: string[];
  plantedCount: number;
  fairSnapshot: unknown;
  currentRoundProofs: FlowerpokerRoundProof[];
};

/** Server-generated round (authoritative). */
export type FlowerpokerServerRound = {
  player: string[];
  house: string[];
  plantedCount?: number;
  fairSnapshot: unknown;
  currentRoundProofs?: FlowerpokerRoundProof[];
};

/** Public blackjack table state from `blackjack-game` Edge. */
export type BlackjackPublicGame = {
  phase: string;
  status?: string;
  playerCards: string[];
  dealerCards: string[];
  holeRevealed: boolean;
  playerTotal: string;
  dealerTotal: string;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canInsurance: boolean;
  stakeAmount: number;
  baseStake: number;
  mainStake: number;
  doubleStake: number;
  insuranceStake: number;
  roundLog: { t: string; detail?: string }[];
  fairSnapshot: Record<string, unknown> | null;
};

/** bankroll-info Edge: dynamic max stake vs on-chain house SPL balance. */
export type BankrollStakeCapInfo = {
  ok: boolean;
  enforced: boolean;
  maxStake: number | null;
  bankrollBalanceUi: number | null;
  ratio: number | null;
  ratioPercent: number | null;
  error?: string;
};

export type AdminSweepItem = {
  depositWalletAddress: string;
  sourceAta: string;
  rawAmount: string;
  uiAmount: number;
};

export type AdminSweepDebugLine = {
  t: string;
  msg: string;
  data?: Record<string, unknown>;
};

/** Row from `playhouse-feed` / `playhouse_list_settled_bets` (settled; optional in_progress when filtered by wallet). */
export type PlayhouseBetRow = {
  id: string;
  gameKey: string;
  /** `settled` | `in_progress` from DB metadata. */
  sessionStatus?: string;
  settledAt: string | null;
  stakeAmount: number | null;
  payoutAmount: number | null;
  winner: string | null;
  playerHand: string | null;
  houseHand: string | null;
  username: string | null;
  walletAddress: string | null;
  fairSnapshot: Record<string, unknown> | null;
  finalRound: { player: string[]; house: string[] } | null;
};

@Injectable({
  providedIn: 'root'
})
export class ClaimyEdgeService {
  constructor(private readonly config: ConfigService) {}

  private functionsUrl(slug: string): string {
    return `${this.config.supabaseUrl.replace(/\/$/, '')}/functions/v1/${slug}`;
  }

  /** Supabase Edge Functions often require anon key in `apikey` + `Authorization` when called from the browser. */
  private edgeJsonHeaders(): HeadersInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const anon = this.config.supabaseAnonKey?.trim();
    if (anon) {
      headers['apikey'] = anon;
      headers['Authorization'] = `Bearer ${anon}`;
    }
    return headers;
  }

  private parseEdgeJson(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private readNum(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }

  async startFlowerpokerBet(body: {
    walletAddress: string;
    betAmount: string;
    /** Optional; server generates one if omitted. */
    clientSeed?: string | null;
  }): Promise<{
    ok: boolean;
    gameId?: string;
    stakeAmount?: number;
    payoutMultiplier?: number;
    playableBalance?: number;
    round?: FlowerpokerServerRound;
    error?: string;
  }> {
    try {
      const res = await fetch(this.functionsUrl('flowerpoker-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'start_bet',
          walletAddress: body.walletAddress,
          betAmount: body.betAmount,
          clientSeed: body.clientSeed ?? null
        })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const businessOk = res.ok && data['ok'] === true;
      const stake = this.readNum(data['stakeAmount']);
      const playable = this.readNum(data['playableBalance']);
      const mult = this.readNum(data['payoutMultiplier']);
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!businessOk && !errMsg) errMsg = `Request failed (${res.status})`;
      const success = businessOk && typeof data['gameId'] === 'string' && typeof stake === 'number';
      const roundRaw = data['round'];
      const round =
        roundRaw != null && typeof roundRaw === 'object' && !Array.isArray(roundRaw)
          ? (roundRaw as FlowerpokerServerRound)
          : undefined;
      return {
        ok: success,
        gameId: typeof data['gameId'] === 'string' ? data['gameId'] : undefined,
        stakeAmount: stake,
        payoutMultiplier: mult,
        playableBalance: playable,
        round,
        error: success ? undefined : errMsg
      };
    } catch {
      return { ok: false, error: 'Network error starting bet.' };
    }
  }

  async rerollFlowerpokerRound(body: { walletAddress: string; gameId: string }): Promise<{
    ok: boolean;
    round?: FlowerpokerServerRound;
    error?: string;
  }> {
    try {
      const res = await fetch(this.functionsUrl('flowerpoker-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'reroll_round',
          walletAddress: body.walletAddress,
          gameId: body.gameId
        })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const ok = res.ok && data['ok'] === true;
      const roundRaw = data['round'];
      const round =
        roundRaw != null && typeof roundRaw === 'object' && !Array.isArray(roundRaw)
          ? (roundRaw as FlowerpokerServerRound)
          : undefined;
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!ok && !errMsg) errMsg = `Request failed (${res.status})`;
      return { ok, round, error: ok ? undefined : errMsg };
    } catch {
      return { ok: false, error: 'Network error on reroll.' };
    }
  }

  /** Server recomputes winner from stored seeds and rounds; client does not send outcome. */
  async settleFlowerpokerBet(body: { walletAddress: string; gameId: string }): Promise<{
    ok: boolean;
    playableBalance?: number;
    payoutAmount?: number;
    winner?: 'Player' | 'House' | 'Tie';
    playerHand?: string;
    houseHand?: string;
    fairSnapshot?: unknown;
    error?: string;
  }> {
    try {
      const res = await fetch(this.functionsUrl('flowerpoker-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'settle_bet',
          walletAddress: body.walletAddress,
          gameId: body.gameId
        })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const ok = res.ok && data['ok'] === true;
      const playable = this.readNum(data['playableBalance']);
      const payout = this.readNum(data['payoutAmount']);
      const w = data['winner'];
      const winner =
        w === 'Player' || w === 'House' || w === 'Tie' ? (w as 'Player' | 'House' | 'Tie') : undefined;
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!ok && !errMsg) errMsg = `Request failed (${res.status})`;
      return {
        ok,
        playableBalance: playable,
        payoutAmount: payout,
        winner,
        playerHand: typeof data['playerHand'] === 'string' ? data['playerHand'] : undefined,
        houseHand: typeof data['houseHand'] === 'string' ? data['houseHand'] : undefined,
        fairSnapshot: data['fairSnapshot'],
        error: ok ? undefined : errMsg
      };
    } catch {
      return { ok: false, error: 'Network error settling bet.' };
    }
  }

  async saveFlowerpokerRoundState(body: {
    walletAddress: string;
    gameId: string;
    plantedCount: number;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(this.functionsUrl('flowerpoker-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'save_round_state',
          walletAddress: body.walletAddress,
          gameId: body.gameId,
          plantedCount: body.plantedCount
        })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const ok = res.ok && data['ok'] === true;
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!ok && !errMsg) errMsg = `Request failed (${res.status})`;
      return { ok, error: ok ? undefined : errMsg };
    } catch {
      return { ok: false, error: 'Network error saving round.' };
    }
  }

  async resumeFlowerpokerSession(walletAddress: string): Promise<{
    ok: boolean;
    active?: boolean;
    staleRefunded?: boolean;
    gameId?: string;
    stakeAmount?: number;
    playableBalance?: number;
    currentRound?: FlowerpokerPersistedRound;
    error?: string;
  }> {
    const w = walletAddress?.trim();
    if (!w) return { ok: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('flowerpoker-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ action: 'resume_session', walletAddress: w })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const businessOk = res.ok && data['ok'] === true;
      const stake = this.readNum(data['stakeAmount']);
      const playable = this.readNum(data['playableBalance']);
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!businessOk && !errMsg) errMsg = `Request failed (${res.status})`;
      if (!businessOk) return { ok: false, error: errMsg };
      const staleRefunded = data['staleRefunded'] === true;
      const active = data['active'] === true;
      const cr = data['currentRound'];
      const currentRound =
        cr != null && typeof cr === 'object' && !Array.isArray(cr)
          ? (cr as FlowerpokerPersistedRound)
          : undefined;
      return {
        ok: true,
        active,
        staleRefunded,
        gameId: typeof data['gameId'] === 'string' ? data['gameId'] : undefined,
        stakeAmount: stake,
        playableBalance: playable,
        currentRound
      };
    } catch {
      return { ok: false, error: 'Network error resuming session.' };
    }
  }

  async startBlackjackBet(body: {
    walletAddress: string;
    betAmount: string;
    clientSeed?: string | null;
  }): Promise<{
    ok: boolean;
    gameId?: string;
    stakeAmount?: number;
    playableBalance?: number;
    game?: BlackjackPublicGame;
    settled?: boolean;
    winner?: 'Player' | 'House' | 'Tie';
    payoutAmount?: number;
    playerHand?: string;
    houseHand?: string;
    fairSnapshot?: unknown;
    error?: string;
  }> {
    try {
      const res = await fetch(this.functionsUrl('blackjack-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'start_bet',
          walletAddress: body.walletAddress,
          betAmount: body.betAmount,
          clientSeed: body.clientSeed ?? null
        })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const businessOk = res.ok && data['ok'] === true;
      const stake = this.readNum(data['stakeAmount']);
      const playable = this.readNum(data['playableBalance']);
      const payout = this.readNum(data['payoutAmount']);
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!businessOk && !errMsg) errMsg = `Request failed (${res.status})`;
      const settled = data['settled'] === true;
      const gameRaw = data['game'];
      const game =
        gameRaw != null && typeof gameRaw === 'object' && !Array.isArray(gameRaw)
          ? (gameRaw as BlackjackPublicGame)
          : undefined;
      const w = data['winner'];
      const winner =
        w === 'Player' || w === 'House' || w === 'Tie' ? (w as 'Player' | 'House' | 'Tie') : undefined;
      const success = businessOk && (settled || typeof data['gameId'] === 'string');
      return {
        ok: success,
        gameId: typeof data['gameId'] === 'string' ? data['gameId'] : undefined,
        stakeAmount: stake,
        playableBalance: playable,
        game,
        settled,
        winner,
        payoutAmount: payout,
        playerHand: typeof data['playerHand'] === 'string' ? data['playerHand'] : undefined,
        houseHand: typeof data['houseHand'] === 'string' ? data['houseHand'] : undefined,
        fairSnapshot: data['fairSnapshot'],
        error: success ? undefined : errMsg
      };
    } catch {
      return { ok: false, error: 'Network error starting bet.' };
    }
  }

  async blackjackPlayerAction(body: {
    walletAddress: string;
    gameId: string;
    move: 'insurance_yes' | 'insurance_no' | 'hit' | 'stand' | 'double';
  }): Promise<{
    ok: boolean;
    settled?: boolean;
    winner?: 'Player' | 'House' | 'Tie';
    payoutAmount?: number;
    playableBalance?: number;
    game?: BlackjackPublicGame;
    fairSnapshot?: unknown;
    error?: string;
  }> {
    try {
      const res = await fetch(this.functionsUrl('blackjack-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'player_action',
          walletAddress: body.walletAddress,
          gameId: body.gameId,
          move: body.move
        })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const ok = res.ok && data['ok'] === true;
      const playable = this.readNum(data['playableBalance']);
      const payout = this.readNum(data['payoutAmount']);
      const w = data['winner'];
      const winner =
        w === 'Player' || w === 'House' || w === 'Tie' ? (w as 'Player' | 'House' | 'Tie') : undefined;
      const gameRaw = data['game'];
      const game =
        gameRaw != null && typeof gameRaw === 'object' && !Array.isArray(gameRaw)
          ? (gameRaw as BlackjackPublicGame)
          : undefined;
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!ok && !errMsg) errMsg = `Request failed (${res.status})`;
      return {
        ok,
        settled: data['settled'] === true,
        winner,
        payoutAmount: payout,
        playableBalance: playable,
        game,
        fairSnapshot: data['fairSnapshot'],
        error: ok ? undefined : errMsg
      };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  }

  async resumeBlackjackSession(walletAddress: string): Promise<{
    ok: boolean;
    active?: boolean;
    staleRefunded?: boolean;
    gameId?: string;
    stakeAmount?: number;
    playableBalance?: number;
    game?: BlackjackPublicGame;
    error?: string;
  }> {
    const w = walletAddress?.trim();
    if (!w) return { ok: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('blackjack-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ action: 'resume_session', walletAddress: w })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const businessOk = res.ok && data['ok'] === true;
      const stake = this.readNum(data['stakeAmount']);
      const playable = this.readNum(data['playableBalance']);
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!businessOk && !errMsg) errMsg = `Request failed (${res.status})`;
      if (!businessOk) return { ok: false, error: errMsg };
      const staleRefunded = data['staleRefunded'] === true;
      const active = data['active'] === true;
      const gameRaw = data['game'];
      const game =
        gameRaw != null && typeof gameRaw === 'object' && !Array.isArray(gameRaw)
          ? (gameRaw as BlackjackPublicGame)
          : undefined;
      return {
        ok: true,
        active,
        staleRefunded,
        gameId: typeof data['gameId'] === 'string' ? data['gameId'] : undefined,
        stakeAmount: stake,
        playableBalance: playable,
        game
      };
    } catch {
      return { ok: false, error: 'Network error resuming session.' };
    }
  }

  /** One-shot Dice roll (`dice-game` Edge). */
  async rollDice(body: {
    walletAddress: string;
    betAmount: string;
    mode: 'under' | 'over';
    target: number;
    clientSeed?: string | null;
  }): Promise<{
    ok: boolean;
    gameId?: string;
    settled?: boolean;
    roll?: number;
    multiplier?: number;
    winCount?: number;
    winner?: 'Player' | 'House';
    payoutAmount?: number;
    playableBalance?: number;
    playerHand?: string;
    houseHand?: string;
    fairSnapshot?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      const res = await fetch(this.functionsUrl('dice-game'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'roll',
          walletAddress: body.walletAddress,
          betAmount: body.betAmount,
          mode: body.mode,
          target: body.target,
          clientSeed: body.clientSeed ?? null
        })
      });
      const text = await res.text();
      const data = this.parseEdgeJson(text);
      const businessOk = res.ok && data['ok'] === true;
      const playable = this.readNum(data['playableBalance']);
      const payout = this.readNum(data['payoutAmount']);
      const mult = this.readNum(data['multiplier']);
      const wc = this.readNum(data['winCount']);
      const roll = typeof data['roll'] === 'number' ? data['roll'] : parseInt(String(data['roll'] ?? ''), 10);
      let errMsg =
        (typeof data['error'] === 'string' && data['error']) ||
        (typeof data['message'] === 'string' && data['message']) ||
        undefined;
      if (!businessOk && !errMsg) errMsg = `Request failed (${res.status})`;
      const w = data['winner'];
      const winner = w === 'Player' || w === 'House' ? (w as 'Player' | 'House') : undefined;
      const fs = data['fairSnapshot'];
      const fairSnapshot =
        fs != null && typeof fs === 'object' && !Array.isArray(fs) ? (fs as Record<string, unknown>) : undefined;
      return {
        ok: businessOk,
        gameId: typeof data['gameId'] === 'string' ? data['gameId'] : undefined,
        settled: data['settled'] === true,
        roll: Number.isFinite(roll) ? roll : undefined,
        multiplier: mult,
        winCount: wc !== undefined && Number.isFinite(wc) ? Math.round(wc) : undefined,
        winner,
        payoutAmount: payout,
        playableBalance: playable,
        playerHand: typeof data['playerHand'] === 'string' ? data['playerHand'] : undefined,
        houseHand: typeof data['houseHand'] === 'string' ? data['houseHand'] : undefined,
        fairSnapshot,
        error: businessOk ? undefined : errMsg
      };
    } catch {
      return { ok: false, error: 'Network error rolling dice.' };
    }
  }

  async adminSweepWhoAmI(walletAddress: string): Promise<{ ok: boolean; isAdmin: boolean; error?: string }> {
    const w = walletAddress?.trim();
    if (!w) return { ok: false, isAdmin: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('admin-sweep-wallets'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ action: 'admin_whoami', walletAddress: w })
      });
      const data = this.parseEdgeJson(await res.text());
      const ok = res.ok && data['ok'] === true;
      return {
        ok,
        isAdmin: ok && data['isAdmin'] === true,
        error: ok ? undefined : ((typeof data['error'] === 'string' && data['error']) || `Request failed (${res.status})`)
      };
    } catch {
      return { ok: false, isAdmin: false, error: 'Network error.' };
    }
  }

  async adminSweepWallets(body: {
    walletAddress: string;
    mode: 'summary_only' | 'dry_run' | 'execute';
    maxWallets?: number;
    destinationWallet?: string;
    scanAll?: boolean;
    debug?: boolean;
  }): Promise<{
    ok: boolean;
    runId?: string;
    walletsScanned?: number;
    walletsWithBalance?: number;
    walletsWithBalanceAll?: number;
    topHoldersLimit?: number;
    totalUiAmount?: number;
    scanAll?: boolean;
    swept?: number;
    failed?: number;
    items?: AdminSweepItem[];
    debug?: AdminSweepDebugLine[];
    error?: string;
  }> {
    const w = body.walletAddress?.trim();
    if (!w) return { ok: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('admin-sweep-wallets'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: body.mode,
          walletAddress: w,
          maxWallets: body.maxWallets ?? 150,
          destinationWallet: body.destinationWallet?.trim() || undefined,
          scanAll: body.scanAll === true,
          debug: body.debug === true
        })
      });
      const data = this.parseEdgeJson(await res.text());
      const ok = res.ok && data['ok'] === true;
      return {
        ok,
        runId: typeof data['runId'] === 'string' ? data['runId'] : undefined,
        walletsScanned: this.readNum(data['walletsScanned']),
        walletsWithBalance: this.readNum(data['walletsWithBalance']),
        walletsWithBalanceAll: this.readNum(data['walletsWithBalanceAll']),
        topHoldersLimit: this.readNum(data['topHoldersLimit']),
        totalUiAmount: this.readNum(data['totalUiAmount']),
        scanAll: data['scanAll'] === true,
        swept: this.readNum(data['swept']),
        failed: this.readNum(data['failed']),
        items: Array.isArray(data['items']) ? (data['items'] as AdminSweepItem[]) : undefined,
        debug: Array.isArray(data['debug']) ? (data['debug'] as AdminSweepDebugLine[]) : undefined,
        error: ok ? undefined : ((typeof data['error'] === 'string' && data['error']) || `Request failed (${res.status})`)
      };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  }

  /** Confirms the Phantom wallet linked on Supabase for this session (refresh / verify). */
  async fetchLinkedRegistrationWallet(phantomWalletAddress: string): Promise<{
    registrationWallet: string;
    username: string;
  } | null> {
    const w = phantomWalletAddress?.trim();
    if (!w) return null;
    const res = await fetch(this.functionsUrl('account-linked-wallet'), {
      method: 'POST',
      headers: this.edgeJsonHeaders(),
      body: JSON.stringify({ walletAddress: w })
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      registrationWallet?: string;
      username?: string;
      error?: string;
    };
    if (!res.ok || data.ok !== true || !data.registrationWallet) {
      return null;
    }
    return {
      registrationWallet: data.registrationWallet,
      username: data.username ?? ''
    };
  }

  /**
   * Reconcile DB `playable_balance` with on-chain SPL on the custodial deposit ATA, then return balance.
   * Used by wallet Refresh — requires Edge secrets `SOLANA_RPC_URL` + `CLAIMY_SPL_MINT` (same as withdraw-spl).
   */
  async syncPlayableFromChain(walletAddress: string): Promise<number | null> {
    const w = walletAddress?.trim();
    if (!w) return null;
    try {
      const res = await fetch(this.functionsUrl('claimy-credits'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ action: 'sync_from_chain', walletAddress: w })
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        playableBalance?: number;
        error?: string;
      };
      if (data.ok === true && typeof data.playableBalance === 'number' && Number.isFinite(data.playableBalance)) {
        return data.playableBalance;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Playable balance from Postgres (claimy-credits Edge). Returns null if unavailable
   * (function not deployed / RPC error) so the client can fall back to on-chain SPL balance.
   */
  async fetchPlayableBalance(walletAddress: string): Promise<number | null> {
    const w = walletAddress?.trim();
    if (!w) return null;
    try {
      const res = await fetch(this.functionsUrl('claimy-credits'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ action: 'get', walletAddress: w })
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        playableBalance?: number;
        error?: string;
      };
      if (data.ok === true && typeof data.playableBalance === 'number' && Number.isFinite(data.playableBalance)) {
        return data.playableBalance;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Max stake vs on-chain bankroll wallet (Edge `bankroll-info`). When `enforced` is false, caps are off (no env wallet).
   */
  async fetchBankrollStakeCap(): Promise<BankrollStakeCapInfo> {
    try {
      const res = await fetch(this.functionsUrl('bankroll-info'), {
        method: 'GET',
        headers: this.edgeJsonHeaders()
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (data['ok'] === false) {
        return {
          ok: false,
          enforced: !!data['configured'],
          maxStake: null,
          bankrollBalanceUi: null,
          ratio: null,
          ratioPercent: null,
          error:
            (typeof data['error'] === 'string' && data['error']) || 'Bankroll info unavailable.'
        };
      }
      if (data['enforced'] === false) {
        return {
          ok: true,
          enforced: false,
          maxStake: null,
          bankrollBalanceUi: null,
          ratio: null,
          ratioPercent: null
        };
      }
      return {
        ok: true,
        enforced: true,
        maxStake: this.readNum(data['maxStake']) ?? null,
        bankrollBalanceUi: this.readNum(data['bankrollBalanceUi']) ?? null,
        ratio: this.readNum(data['ratio']) ?? null,
        ratioPercent: this.readNum(data['ratioPercent']) ?? null
      };
    } catch {
      return {
        ok: false,
        enforced: false,
        maxStake: null,
        bankrollBalanceUi: null,
        ratio: null,
        ratioPercent: null,
        error: 'Network error loading bankroll info.'
      };
    }
  }

  /**
   * Credit ledger from Postgres (`claimy_credit_ledger`): deposits, withdraws, chain sync, games, etc.
   */
  async fetchCreditLedger(
    walletAddress: string,
    opts?: { direction?: 'all' | 'incoming' | 'outgoing'; limit?: number }
  ): Promise<{
    ok: boolean;
    entries?: ClaimyCreditLedgerRow[];
    error?: string;
  }> {
    const w = walletAddress?.trim();
    if (!w) return { ok: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('claimy-credits'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_ledger',
          walletAddress: w,
          direction: opts?.direction ?? 'all',
          limit: opts?.limit ?? 80
        })
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        entries?: ClaimyCreditLedgerRow[];
        error?: string;
      };
      if (data.ok === true && Array.isArray(data.entries)) {
        return { ok: true, entries: data.entries };
      }
      return { ok: false, error: data.error ?? 'Could not load history.' };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.trim() : '';
      return {
        ok: false,
        error: msg || 'Network error loading history (check Supabase anon key and claimy-credits deploy).'
      };
    }
  }

  /** Signed withdraw intent; server verifies signature (on-chain transfer when enabled). */
  async submitWithdrawRequest(body: {
    walletAddress: string;
    message: string;
    signatureBase64: string;
    amount: string;
    /** Same mint as in the signed message; helps Edge when CLAIMY_SPL_MINT secret is unset. */
    mint?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    signatureValid?: boolean;
    signature?: string;
    /** Set when on-chain withdraw succeeded but DB ledger RPC failed (reconcile manually). */
    ledgerError?: string;
  }> {
    const res = await fetch(this.functionsUrl('withdraw-spl'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      signatureValid?: boolean;
      signature?: string;
      ledgerError?: string;
    };
    return {
      ok: data.ok === true,
      error: data.error ?? data.message,
      signatureValid: data.signatureValid === true,
      signature: typeof data.signature === 'string' ? data.signature : undefined,
      ledgerError: typeof data.ledgerError === 'string' ? data.ledgerError : undefined
    };
  }

  /** Top referral collectors — 15 rows, referral_count ≥ 1 (claimy-referrals Edge). */
  async fetchReferralLeaderboard(): Promise<{
    ok: boolean;
    rows?: Array<{ username: string; referralCount: number }>;
    error?: string;
  }> {
    try {
      const res = await fetch(this.functionsUrl('claimy-referrals'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ action: 'leaderboard_referrals' })
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: Array<{ username: string; referralCount: number }>;
        error?: string;
      };
      if (data.ok === true && Array.isArray(data.rows)) {
        return { ok: true, rows: data.rows };
      }
      return { ok: false, error: data.error ?? 'Could not load referral leaderboard.' };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  }

  /** Current user's referral code + count (claimy-referrals). */
  async fetchMyReferral(walletAddress: string): Promise<{
    ok: boolean;
    referralCode?: string | null;
    referralCount?: number;
    error?: string;
  }> {
    const w = walletAddress?.trim();
    if (!w) return { ok: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('claimy-referrals'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ action: 'mine', walletAddress: w })
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        referralCode?: string | null;
        referralCount?: number;
        error?: string;
      };
      if (data.ok === true) {
        return {
          ok: true,
          referralCode: data.referralCode ?? null,
          referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0
        };
      }
      return { ok: false, error: data.error ?? 'Could not load referral info.' };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  }

  /** Same payload as `wallet-login` Edge (for refreshing profile fields after login). */
  async fetchWalletLogin(walletAddress: string): Promise<{
    found: boolean;
    username?: string;
    createdAt?: string | null;
    depositAddress?: string | null;
    referralCode?: string | null;
    referralCount?: number;
    gamesClientSeed?: string | null;
    error?: string;
  }> {
    const w = walletAddress?.trim();
    if (!w) return { found: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('wallet-login'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({ walletAddress: w })
      });
      if (!res.ok) {
        return { found: false, error: `Request failed (${res.status})` };
      }
      const data = (await res.json().catch(() => ({}))) as {
        found?: boolean;
        error?: string;
        username?: string;
        createdAt?: string | null;
        depositAddress?: string | null;
        referralCode?: string | null;
        referralCount?: number;
        gamesClientSeed?: string | null;
      };
      if (data.error && !data.found) {
        return { found: false, error: data.error };
      }
      return {
        found: data.found === true,
        username: data.username,
        createdAt: data.createdAt ?? null,
        depositAddress: data.depositAddress ?? null,
        referralCode: data.referralCode ?? null,
        referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
        gamesClientSeed: data.gamesClientSeed ?? null
      };
    } catch {
      return { found: false, error: 'Network error.' };
    }
  }

  /** Persist provably-fair client seed (`claimy-profile` Edge). */
  async setGamesClientSeed(body: {
    walletAddress: string;
    gamesClientSeed: string | null;
  }): Promise<{ ok: boolean; gamesClientSeed?: string | null; error?: string }> {
    const w = body.walletAddress?.trim();
    if (!w) return { ok: false, error: 'No wallet.' };
    try {
      const res = await fetch(this.functionsUrl('claimy-profile'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'set_games_client_seed',
          walletAddress: w,
          gamesClientSeed: body.gamesClientSeed
        })
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        gamesClientSeed?: string | null;
        error?: string;
      };
      const ok = res.ok && data.ok === true;
      let errMsg =
        (typeof data.error === 'string' && data.error) ||
        (typeof (data as { message?: string }).message === 'string' && (data as { message?: string }).message) ||
        undefined;
      if (!ok && !errMsg) errMsg = `Request failed (${res.status})`;
      return {
        ok,
        gamesClientSeed: data.gamesClientSeed ?? null,
        error: ok ? undefined : errMsg
      };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  }

  /** Paginated settled Flowerpoker + Blackjack + Dice bets for The Playhouse (`playhouse-feed` Edge). */
  async fetchPlayhouseBets(opts: {
    page: number;
    pageSize: number;
    walletAddress?: string | null;
  }): Promise<{
    ok: boolean;
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    rows?: PlayhouseBetRow[];
    error?: string;
  }> {
    const page = Math.max(1, parseInt(String(opts.page ?? 1), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(opts.pageSize ?? 15), 10) || 15));
    const wallet = opts.walletAddress?.trim() || null;
    if (!this.config.supabaseAnonKey?.trim()) {
      return {
        ok: false,
        error:
          'Missing Supabase anon key. Set it in environment.prod.ts (production) or .env + node scripts/sync-env.cjs (dev).'
      };
    }
    const url = this.config.supabaseUrl?.replace(/\/$/, '');
    if (!url) {
      return { ok: false, error: 'Missing Supabase URL.' };
    }
    try {
      const res = await fetch(this.functionsUrl('playhouse-feed'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'list_bets',
          page,
          pageSize,
          walletAddress: wallet
        })
      });
      const text = await res.text();
      const payload = this.parseEdgeJson(text) as {
        ok?: boolean;
        page?: number;
        pageSize?: number;
        total?: number;
        totalPages?: number;
        rows?: PlayhouseBetRow[];
        error?: string;
      };
      if (!res.ok) {
        const errMsg =
          (typeof payload.error === 'string' && payload.error) ||
          (text && text.length < 400 ? text : null) ||
          `Request failed (${res.status}).`;
        const jwtHint =
          res.status === 401 || res.status === 403
            ? ' In Supabase Dashboard → Edge Functions → playhouse-feed, turn JWT verification OFF (or deploy supabase/config.toml with verify_jwt = false).'
            : '';
        return { ok: false, error: errMsg + jwtHint };
      }
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Unexpected response from playhouse-feed.' };
      }
      if (payload.ok !== true) {
        const errMsg =
          (typeof payload.error === 'string' && payload.error) ||
          'Could not load bets (check that SQL migration playhouse_list_settled_bets is applied).';
        return { ok: false, error: errMsg };
      }
      return {
        ok: true,
        page: payload.page,
        pageSize: payload.pageSize,
        total: payload.total,
        totalPages: payload.totalPages,
        rows: Array.isArray(payload.rows) ? payload.rows : []
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.trim() : '';
      const base =
        msg ||
        'Network error. Deploy playhouse-feed, set JWT verify off, and apply migration claimy_playhouse_feed.sql.';
      const fetchHint =
        /failed to fetch/i.test(msg) || !msg
          ? ' Also try disabling ad blockers for this site, or check that the app’s Supabase URL matches your project.'
          : '';
      return { ok: false, error: base + fetchHint };
    }
  }

  /**
   * Aggregated stats for Ranking progress (`playhouse-feed` action `player_ranking_stats`): Flowerpoker + Blackjack.
   * Server-side SUM/COUNT — no paging. Requires RPC `playhouse_player_ranking_stats` in Postgres.
   */
  async fetchPlayerRankingStats(walletAddress: string): Promise<{
    ok: boolean;
    betsSettled?: number;
    lifetimeWagered?: number;
    pnl?: number;
    wins?: number;
    losses?: number;
    ties?: number;
    error?: string;
  }> {
    const w = walletAddress?.trim();
    if (!w) {
      return { ok: false, error: 'Wallet address required.' };
    }
    if (!this.config.supabaseAnonKey?.trim()) {
      return {
        ok: false,
        error:
          'Missing Supabase anon key. Set it in environment.prod.ts (production) or .env + node scripts/sync-env.cjs (dev).'
      };
    }
    const url = this.config.supabaseUrl?.replace(/\/$/, '');
    if (!url) {
      return { ok: false, error: 'Missing Supabase URL.' };
    }
    try {
      const res = await fetch(this.functionsUrl('playhouse-feed'), {
        method: 'POST',
        headers: this.edgeJsonHeaders(),
        body: JSON.stringify({
          action: 'player_ranking_stats',
          walletAddress: w
        })
      });
      const text = await res.text();
      const payload = this.parseEdgeJson(text) as {
        ok?: boolean;
        stats?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok) {
        const errMsg =
          (typeof payload.error === 'string' && payload.error) ||
          (text && text.length < 400 ? text : null) ||
          `Request failed (${res.status}).`;
        return { ok: false, error: errMsg };
      }
      if (!payload || payload.ok !== true) {
        const errMsg =
          (typeof payload.error === 'string' && payload.error) ||
          'Could not load ranking stats (apply migration claimy_playhouse_player_ranking_stats.sql and redeploy playhouse-feed).';
        return { ok: false, error: errMsg };
      }
      const s = payload.stats ?? {};
      const readNum = (k: string): number => {
        const v = s[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      };
      const readInt = (k: string): number => {
        const n = Math.round(readNum(k));
        return Number.isFinite(n) ? n : 0;
      };
      return {
        ok: true,
        betsSettled: readInt('betsSettled'),
        lifetimeWagered: readNum('lifetimeWagered'),
        pnl: readNum('pnl'),
        wins: readInt('wins'),
        losses: readInt('losses'),
        ties: readInt('ties')
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.trim() : '';
      return {
        ok: false,
        error: msg || 'Network error loading ranking stats.'
      };
    }
  }
}
