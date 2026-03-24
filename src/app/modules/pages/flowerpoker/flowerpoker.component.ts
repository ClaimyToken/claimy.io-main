import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import {
  ClaimyEdgeService,
  FlowerpokerPersistedRound,
  FlowerpokerRoundProof,
  FlowerpokerServerRound
} from 'src/app/services/claimy-edge.service';
import { WalletAuthService } from 'src/app/services/wallet-auth.service';
import {
  FairSnapshot,
  VerificationResult,
  verifyFlowerpokerRound
} from 'src/app/modules/pages/flowerpoker/flowerpoker-provably-fair';
import { PlayerRankingService } from 'src/app/services/player-ranking.service';

declare global {
  interface Window {
    phantom?: any;
  }
}

type FlowerId =
  | 'mixed'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'purple'
  | 'assorted'
  | 'black'
  | 'white';

type HandRankKey =
  | 'bust'
  | 'one_pair'
  | 'two_pair'
  | 'three_kind'
  | 'full_house'
  | 'four_kind'
  | 'five_kind';

type HandScore = {
  key: HandRankKey;
  label: string;
  value: number;
};

type FlowerMeta = {
  id: FlowerId;
  label: string;
  weight: number;
  image: string;
};

const FLOWERS: FlowerMeta[] = [
  { id: 'mixed', label: 'Mixed flowers', weight: 150, image: 'https://oldschool.runescape.wiki/images/Mixed_flowers.png' },
  { id: 'red', label: 'Red flowers', weight: 150, image: 'https://oldschool.runescape.wiki/images/Red_flowers.png' },
  { id: 'yellow', label: 'Yellow flowers', weight: 150, image: 'https://oldschool.runescape.wiki/images/Yellow_flowers.png' },
  { id: 'blue', label: 'Blue flowers', weight: 150, image: 'https://oldschool.runescape.wiki/images/Blue_flowers.png' },
  { id: 'orange', label: 'Orange flowers', weight: 150, image: 'https://oldschool.runescape.wiki/images/Orange_flowers.png' },
  { id: 'purple', label: 'Purple flowers', weight: 148, image: 'https://oldschool.runescape.wiki/images/Purple_flowers.png' },
  { id: 'assorted', label: 'Assorted flowers', weight: 100, image: 'https://oldschool.runescape.wiki/images/Assorted_flowers.png' },
  { id: 'black', label: 'Black flowers', weight: 2, image: 'https://oldschool.runescape.wiki/images/Black_flowers.png' },
  { id: 'white', label: 'White flowers', weight: 1, image: 'https://oldschool.runescape.wiki/images/White_flowers.png' }
];

@Component({
  selector: 'app-flowerpoker',
  templateUrl: './flowerpoker.component.html',
  styleUrls: ['./flowerpoker.component.scss']
})
export class FlowerpokerComponent implements OnInit, OnDestroy {
  readonly seedImage = 'https://oldschool.runescape.wiki/images/Mithril_seeds.png';
  readonly slots = [0, 1, 2, 3, 4];
  readonly flowers = FLOWERS;

  playerRow: (FlowerId | null)[] = [null, null, null, null, null];
  houseRow: (FlowerId | null)[] = [null, null, null, null, null];
  playerMatched: boolean[] = [false, false, false, false, false];
  houseMatched: boolean[] = [false, false, false, false, false];
  plantedCount = 0;
  busy = false;

  message = 'Click each Mithril seed to reveal both rows.';
  result: string | null = null;
  resultTone: 'win' | 'loss' | 'tie' | null = null;
  winnerName: 'Player' | 'House' | 'Tie' | null = null;
  playerHand: HandScore | null = null;
  houseHand: HandScore | null = null;
  fairSnapshot: FairSnapshot | null = null;
  revealingIndex: number | null = null;
  betAmountInput = '';
  placingBet = false;
  settlingBet = false;
  activeGameId: string | null = null;
  activeStake: number | null = null;
  resumingSession = false;
  currentRoundProofs: FlowerpokerRoundProof[] = [];
  toast: { type: 'success' | 'error'; message: string } | null = null;
  private toastClearId: ReturnType<typeof setTimeout> | null = null;
  verifyingRound = false;
  /** Side-by-side checks after clicking Verify round (null until run). */
  verificationReport: VerificationResult | null = null;

  /** Full rules / odds / provably-fair modal on the play card. */
  showFpDetailsModal = false;

  private roundPlayer: FlowerId[] = [];
  private roundHouse: FlowerId[] = [];

  constructor(
    private readonly walletAuth: WalletAuthService,
    private readonly claimyEdge: ClaimyEdgeService,
    private readonly playerRanking: PlayerRankingService
  ) {}

  get gameSessionActive(): boolean {
    return !!this.activeGameId;
  }

  /** Sum of flower weights (matches server `TOTAL_WEIGHT`, used for per-roll odds). */
  get totalFlowerWeight(): number {
    return this.flowers.reduce((s, f) => s + f.weight, 0);
  }

  flowerChancePercent(weight: number): string {
    const p = (weight / this.totalFlowerWeight) * 100;
    return p < 0.01 ? p.toFixed(4) : p.toFixed(2);
  }

  /** Shown in the details modal; kept in TS so `${` does not break the Angular template parser. */
  get fpDetailsSnippetHmac(): string {
    return [
      'const base = subRoundIndex * 40;',
      '// Player slot i  → counter = base + i           (i = 0..4)',
      '// House slot j   → counter = base + 10 + j      (j = 0..4)',
      '',
      'const msg = `claimy-fp|v1|${clientSeed}|${counter}`;',
      'const sig = await hmacSha256(serverSeedBytes, msg); // raw key = 32-byte secret',
      'const u32 = readUint32BE(sig, 0) >>> 0;',
      `const x = (u32 / 0x100000000) * TOTAL_WEIGHT; // TOTAL_WEIGHT = ${this.totalFlowerWeight}`,
      '// walk cumulative weights → flower id (mixed, red, … white)'
    ].join('\n');
  }

  get fpDetailsSnippetRollDigest(): string {
    return [
      'const preimage =',
      '  `${player.join(\',\')}|${house.join(\',\')}|${subRoundIndex}|${clientSeed}`;',
      'const rollDigest = sha256Hex(utf8Bytes(preimage));'
    ].join('\n');
  }

  readonly fpDetailsSnippetCommit =
    'serverSeedHash = sha256Hex(serverSeedBytes); // shown before reveal\n' +
    '// After settlement: base64(serverSeedBytes) must hash to serverSeedHash';

  openFpDetailsModal(): void {
    this.showFpDetailsModal = true;
    this.lockBodyScroll();
  }

  closeFpDetailsModal(): void {
    this.showFpDetailsModal = false;
    this.unlockBodyScroll();
  }

  /** Avoid layout shift when hiding the scrollbar (Windows): pad body by gutter width. */
  private lockBodyScroll(): void {
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter > 0) {
      document.body.style.paddingRight = `${gutter}px`;
    }
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseDetails(): void {
    if (this.showFpDetailsModal) {
      this.closeFpDetailsModal();
    }
  }

  ngOnInit(): void {
    this.resetBoardOnly();
    this.message = 'Enter a bet amount and start round.';
    void this.tryResumeSessionWithRetries();
  }

  /** Wallet + Phantom may not be ready on first tick after refresh; session wallet from login is persisted separately. */
  private async tryResumeSessionWithRetries(maxWaitMs = 6000): Promise<void> {
    const stepMs = 200;
    let waited = 0;
    while (waited < maxWaitMs) {
      const wallet = this.resolveWallet();
      if (wallet) {
        await this.tryResumeSession();
        return;
      }
      await this.delay(stepMs);
      waited += stepMs;
    }
  }

  private async tryResumeSession(): Promise<void> {
    const wallet = this.resolveWallet();
    if (!wallet) return;
    this.resumingSession = true;
    try {
      await this.repairServerFromLocalSnapshot(wallet);
      const res = await this.claimyEdge.resumeFlowerpokerSession(wallet);
      if (!res.ok) return;
      if (res.staleRefunded) {
        if (typeof res.playableBalance === 'number' && Number.isFinite(res.playableBalance)) {
          this.walletAuth.claimyCreditsBalance = res.playableBalance;
        }
        this.flashToast(
          'A previous locked bet had no saved progress; your stake was refunded to playable balance.',
          5200,
          'success'
        );
        return;
      }
      if (!res.active || !res.gameId || !res.currentRound || !this.isValidPersistedRound(res.currentRound)) return;
      if (typeof res.playableBalance === 'number' && Number.isFinite(res.playableBalance)) {
        this.walletAuth.claimyCreditsBalance = res.playableBalance;
      }
      this.activeGameId = res.gameId;
      this.activeStake = typeof res.stakeAmount === 'number' ? res.stakeAmount : null;
      this.applyResumedRound(res.currentRound);
      this.flashToast('Resumed your in-progress bet.', 3600, 'success');
    } finally {
      this.resumingSession = false;
    }
  }

  private readLocalRoundSnapshot(): { wallet: string; gameId: string; plantedCount: number } | null {
    try {
      const raw = sessionStorage.getItem('claimy.flowerpoker.activeSnap');
      if (!raw) return null;
      const o = JSON.parse(raw) as {
        wallet?: string;
        gameId?: string;
        plantedCount?: number;
      };
      if (!o.wallet || !o.gameId || typeof o.plantedCount !== 'number') return null;
      if (o.plantedCount < 0 || o.plantedCount > 5) return null;
      return { wallet: o.wallet, gameId: o.gameId, plantedCount: o.plantedCount };
    } catch {
      return null;
    }
  }

  private writeLocalRoundSnapshot(wallet: string, gameId: string, plantedCount: number): void {
    try {
      sessionStorage.setItem(
        'claimy.flowerpoker.activeSnap',
        JSON.stringify({
          wallet,
          gameId,
          plantedCount,
          savedAt: Date.now()
        })
      );
    } catch {
      /* ignore */
    }
  }

  private clearLocalRoundSnapshot(): void {
    try {
      sessionStorage.removeItem('claimy.flowerpoker.activeSnap');
    } catch {
      /* ignore */
    }
  }

  /** Push last planted count to the server before resume (fixes refresh before server save completed). */
  private async repairServerFromLocalSnapshot(wallet: string): Promise<void> {
    const snap = this.readLocalRoundSnapshot();
    if (!snap || snap.wallet !== wallet) return;
    await this.claimyEdge.saveFlowerpokerRoundState({
      walletAddress: wallet,
      gameId: snap.gameId,
      plantedCount: snap.plantedCount
    });
  }

  private isValidPersistedRound(cr: FlowerpokerPersistedRound): boolean {
    if (!cr || !Array.isArray(cr.player) || !Array.isArray(cr.house)) return false;
    if (cr.player.length !== 5 || cr.house.length !== 5) return false;
    if (typeof cr.plantedCount !== 'number' || cr.plantedCount < 0 || cr.plantedCount > 5) return false;
    if (!Array.isArray(cr.currentRoundProofs)) return false;
    return true;
  }

  private applyResumedRound(cr: FlowerpokerPersistedRound): void {
    this.roundPlayer = cr.player as FlowerId[];
    this.roundHouse = cr.house as FlowerId[];
    this.plantedCount = cr.plantedCount;
    this.fairSnapshot = (cr.fairSnapshot as FairSnapshot | null) ?? null;
    this.currentRoundProofs = cr.currentRoundProofs.map((p) => ({
      player: [...p.player],
      house: [...p.house]
    }));
    for (let i = 0; i < cr.plantedCount; i++) {
      this.playerRow[i] = this.roundPlayer[i];
      this.houseRow[i] = this.roundHouse[i];
    }
    this.updateMatchedFlags();
    if (this.plantedCount < 5) {
      this.message = `Resumed — click seed ${this.plantedCount + 1} to continue.`;
      return;
    }
    this.message = 'Resumed — finishing round…';
    queueMicrotask(() => void this.finishRoundAfterResume());
  }

  /** Authoritative round from Edge (start bet / reroll). */
  private applyServerRound(round: FlowerpokerServerRound): void {
    this.resetBoardOnly();
    this.verificationReport = null;
    this.roundPlayer = round.player as FlowerId[];
    this.roundHouse = round.house as FlowerId[];
    this.fairSnapshot = (round.fairSnapshot as FairSnapshot | null) ?? null;
    this.currentRoundProofs = (round.currentRoundProofs ?? []).map((p) => ({
      player: [...p.player],
      house: [...p.house]
    }));
    this.plantedCount = 0;
    this.message = 'Click each Mithril seed to reveal both rows.';
  }

  private async finishRoundAfterResume(): Promise<void> {
    const all = [...this.roundPlayer, ...this.roundHouse];
    if (all.some((f) => f === 'black' || f === 'white')) {
      this.result = null;
      this.playerHand = null;
      this.houseHand = null;
      this.message = 'Black or white flower rolled. Reroll triggered, plant again.';
      await this.rerollFromServer();
      return;
    }
    await this.settleActiveBet();
  }

  private async persistRoundState(): Promise<void> {
    if (!this.activeGameId) return;
    const wallet = this.resolveWallet();
    if (!wallet) return;
    this.writeLocalRoundSnapshot(wallet, this.activeGameId, this.plantedCount);
    const res = await this.claimyEdge.saveFlowerpokerRoundState({
      walletAddress: wallet,
      gameId: this.activeGameId,
      plantedCount: this.plantedCount
    });
    if (!res.ok) {
      console.warn('[flowerpoker] save_round_state failed', res.error);
    }
  }

  ngOnDestroy(): void {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    if (this.showFpDetailsModal) {
      this.unlockBodyScroll();
    }
  }

  private flashToast(message: string, durationMs = 3200, kind: 'success' | 'error' = 'success'): void {
    if (this.toastClearId) {
      clearTimeout(this.toastClearId);
      this.toastClearId = null;
    }
    this.toast = { type: kind, message };
    this.toastClearId = setTimeout(() => {
      this.toast = null;
      this.toastClearId = null;
    }, durationMs);
  }

  /** In-memory login → persisted session wallet (survives refresh) → Phantom when injected. */
  private resolveWallet(): string {
    let w = this.walletAuth.walletAddress?.trim() ?? '';
    if (!w) w = this.walletAuth.getPersistedSessionWallet()?.trim() ?? '';
    if (!w) w = window.phantom?.solana?.publicKey?.toString?.()?.trim?.() ?? '';
    return w;
  }

  private resetBoardOnly(): void {
    this.playerRow = [null, null, null, null, null];
    this.houseRow = [null, null, null, null, null];
    this.playerMatched = [false, false, false, false, false];
    this.houseMatched = [false, false, false, false, false];
    this.plantedCount = 0;
    this.busy = false;
    this.result = null;
    this.resultTone = null;
    this.winnerName = null;
    this.playerHand = null;
    this.houseHand = null;
    this.revealingIndex = null;
  }

  async placeBetAndStart(): Promise<void> {
    if (this.placingBet || this.busy || this.settlingBet || this.resumingSession) return;
    if (this.gameSessionActive) {
      this.message = 'Finish the current game before starting a new bet.';
      return;
    }
    const wallet = this.resolveWallet();
    if (!wallet) {
      this.message = 'Please login (or connect Phantom) before placing a bet.';
      return;
    }
    const betRaw = String(this.betAmountInput ?? '').trim();
    const betNormalized = betRaw.replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(betNormalized)) {
      this.message = 'Enter a valid bet amount (example: 10 or 10.5).';
      return;
    }
    const betAmount = Number(betNormalized);
    if (!Number.isFinite(betAmount) || betAmount <= 0) {
      this.message = 'Bet must be greater than zero.';
      return;
    }
    const currentBalance = this.walletAuth.claimyCreditsBalance;
    if (typeof currentBalance === 'number' && Number.isFinite(currentBalance) && betAmount > currentBalance) {
      this.message = 'Insufficient Claimy credits for that bet.';
      return;
    }

    this.placingBet = true;
    this.message = 'Locking bet and creating game session...';
    try {
      const trimmed = this.walletAuth.gamesClientSeed?.trim() ?? '';
      const clientSeed = trimmed.length > 0 ? trimmed : null;
      const res = await this.claimyEdge.startFlowerpokerBet({
        walletAddress: wallet,
        betAmount: betNormalized,
        clientSeed
      });
      if (!res.ok || !res.gameId || typeof res.stakeAmount !== 'number') {
        const err = (res.error ?? 'Could not create bet.').toLowerCase();
        if (err.includes('insufficient')) {
          const dbBalance = await this.claimyEdge.fetchPlayableBalance(wallet);
          if (typeof dbBalance === 'number' && Number.isFinite(dbBalance)) {
            this.walletAuth.claimyCreditsBalance = dbBalance;
            this.message = `Insufficient playable balance in DB (available: ${dbBalance}). Refresh/sync credits, then try again.`;
          } else {
            this.message = 'Insufficient playable balance in DB. Refresh/sync credits, then try again.';
          }
        } else if (err.includes('account not found') || err.includes('user_not_found')) {
          this.message = 'Your wallet account was not found in credits DB. Re-login, then try again.';
        } else if (err.includes('401') || err.includes('jwt')) {
          this.message =
            'Bet API rejected the request (auth). Add CLAIMY_SUPABASE_ANON_KEY to .env, run node scripts/sync-env.cjs, rebuild.';
        } else {
          this.message = res.error ?? 'Could not create bet.';
        }
        this.flashToast(this.message, 5000, 'error');
        return;
      }

      this.activeGameId = res.gameId;
      this.activeStake = res.stakeAmount;
      if (typeof res.playableBalance === 'number' && Number.isFinite(res.playableBalance)) {
        this.walletAuth.claimyCreditsBalance = res.playableBalance;
      }
      if (!res.round) {
        this.message = 'Server did not return a round — try again.';
        this.flashToast(this.message, 5000, 'error');
        return;
      }
      this.flashToast(`Flowerpoker started with ${res.stakeAmount} $CLAIMY.`);
      this.applyServerRound(res.round);
      void this.persistRoundState();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not place bet.';
      this.message = msg;
      this.flashToast(msg, 5000, 'error');
    } finally {
      this.placingBet = false;
    }
  }

  async plant(index: number): Promise<void> {
    if (this.busy || index !== this.plantedCount || this.plantedCount >= this.slots.length) return;
    this.busy = true;
    this.revealingIndex = index;
    this.message = `Planting seed ${index + 1}/5...`;

    await this.delay(1000);

    this.playerRow[index] = this.roundPlayer[index];
    this.houseRow[index] = this.roundHouse[index];
    this.updateMatchedFlags();
    this.plantedCount += 1;
    this.revealingIndex = null;
    this.busy = false;

    await this.persistRoundState();

    if (this.plantedCount === this.slots.length) {
      this.finishRound();
    } else {
      this.message = `Seed ${index + 1} revealed. Click seed ${this.plantedCount + 1}.`;
    }
  }

  getFlowerMeta(id: FlowerId | null): FlowerMeta | null {
    if (!id) return null;
    return this.flowers.find((f) => f.id === id) ?? null;
  }

  private updateMatchedFlags(): void {
    this.playerMatched = this.computeMatchedFlags(this.playerRow);
    this.houseMatched = this.computeMatchedFlags(this.houseRow);
  }

  private computeMatchedFlags(row: (FlowerId | null)[]): boolean[] {
    const counts = new Map<FlowerId, number>();
    for (const v of row) {
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return row.map((v) => !!v && (counts.get(v) ?? 0) >= 2);
  }

  private finishRound(): void {
    const all = [...this.roundPlayer, ...this.roundHouse];
    if (all.some((f) => f === 'black' || f === 'white')) {
      this.result = null;
      this.playerHand = null;
      this.houseHand = null;
      this.message = 'Black or white flower rolled. Reroll triggered, plant again.';
      void this.rerollFromServer();
      return;
    }
    void this.settleActiveBet();
  }

  private async rerollFromServer(): Promise<void> {
    const wallet = this.resolveWallet();
    if (!wallet || !this.activeGameId) return;
    this.busy = true;
    try {
      const res = await this.claimyEdge.rerollFlowerpokerRound({
        walletAddress: wallet,
        gameId: this.activeGameId
      });
      if (!res.ok || !res.round) {
        this.flashToast(res.error ?? 'Could not reroll round.', 5000, 'error');
        return;
      }
      this.applyServerRound(res.round);
      await this.persistRoundState();
    } finally {
      this.busy = false;
    }
  }

  private async settleActiveBet(): Promise<void> {
    const wallet = this.resolveWallet();
    if (!wallet || !this.activeGameId) return;
    if (this.settlingBet) return;
    this.settlingBet = true;

    const res = await this.claimyEdge.settleFlowerpokerBet({
      walletAddress: wallet,
      gameId: this.activeGameId
    });
    this.settlingBet = false;
    if (!res.ok) {
      this.message = `${this.message} Settlement pending: ${res.error ?? 'unknown error'}.`;
      return;
    }
    const w = res.winner;
    if (w === 'Player') {
      this.result = 'Player wins';
      this.resultTone = 'win';
      this.winnerName = 'Player';
    } else if (w === 'House') {
      this.result = 'House wins';
      this.resultTone = 'loss';
      this.winnerName = 'House';
    } else if (w === 'Tie') {
      this.result = 'Tie';
      this.resultTone = 'tie';
      this.winnerName = 'Tie';
    }
    const phLabel = res.playerHand ?? '—';
    const hhLabel = res.houseHand ?? '—';
    this.playerHand = { key: 'bust', label: phLabel, value: 0 };
    this.houseHand = { key: 'bust', label: hhLabel, value: 0 };
    this.message =
      w === 'Player'
        ? `Player wins with ${phLabel} against ${hhLabel}.`
        : w === 'House'
          ? `House wins with ${hhLabel} against ${phLabel}.`
          : `Tie on ${phLabel}.`;
    if (res.fairSnapshot != null) {
      this.fairSnapshot = res.fairSnapshot as FairSnapshot;
    }
    if (typeof res.playableBalance === 'number' && Number.isFinite(res.playableBalance)) {
      this.walletAuth.claimyCreditsBalance = res.playableBalance;
    }
    await this.playerRanking.refresh();
    this.clearLocalRoundSnapshot();
    this.activeGameId = null;
    this.activeStake = null;
    this.currentRoundProofs = [];
    this.betAmountInput = '';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Recomputes SHA-256(server seed), HMAC flower rows, and roll digest locally (after settlement). */
  async verifyProvablyFair(): Promise<void> {
    if (this.verifyingRound) return;
    this.verificationReport = null;
    const snap = this.fairSnapshot;
    if (!snap) {
      this.flashToast('No fairness data for this round.', 4000, 'error');
      return;
    }
    this.verifyingRound = true;
    try {
      const res = await verifyFlowerpokerRound({
        fairSnapshot: snap,
        player: [...this.roundPlayer],
        house: [...this.roundHouse]
      });
      this.verificationReport = res;
      if (res.ok) {
        this.flashToast(res.summary, 5200, 'success');
      } else {
        this.flashToast(res.summary, 6000, 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed.';
      this.flashToast(msg, 5000, 'error');
      this.verificationReport = { ok: false, summary: msg, comparisons: [] };
    } finally {
      this.verifyingRound = false;
    }
  }
}
