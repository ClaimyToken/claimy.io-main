import { Injectable } from '@angular/core';

/** Parsed token account from getTokenAccountsByOwner (jsonParsed). */
interface JsonParsedTokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString?: string;
}

interface SplTokenBalanceServiceJsonRpc {
  jsonrpc: string;
  id: number;
  result?: {
    value: Array<{
      account: {
        data: {
          parsed: {
            info: {
              mint: string;
              tokenAmount: JsonParsedTokenAmount;
            };
          };
        };
      };
    }>;
  };
  error?: { message: string };
}

@Injectable({
  providedIn: 'root'
})
export class SplTokenBalanceService {
  /**
   * SPL token balance for custodial `owner` ATA for `mint` (human amount using mint decimals).
   * Uses Solana JSON-RPC getTokenAccountsByOwner + jsonParsed (no Node-only Solana SDK in the browser).
   */
  async getSplBalance(ownerBase58: string, mintBase58: string, rpcUrl: string): Promise<number> {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        ownerBase58,
        { mint: mintBase58 },
        { encoding: 'jsonParsed' }
      ]
    };

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const json = (await res.json()) as SplTokenBalanceServiceJsonRpc;
    if (json.error?.message) {
      throw new Error(json.error.message);
    }

    const list = json.result?.value ?? [];
    if (list.length === 0) {
      return 0;
    }

    const ta = list[0].account.data.parsed.info.tokenAmount;
    if (typeof ta.uiAmount === 'number' && Number.isFinite(ta.uiAmount)) {
      return ta.uiAmount;
    }
    const raw = BigInt(ta.amount);
    const d = ta.decimals;
    return Number(raw) / Math.pow(10, d);
  }
}
