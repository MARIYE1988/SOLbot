// src/strategies.ts
export type TokenSymbol = "HYPE" | "COIN2" | "COIN3" | "COIN4"; // extend as needed

export interface StrategyConfig {
  symbol: TokenSymbol;
  pairId: string;           // DexScreener pair id
  inputMint: string;        // token you hold, e.g. HYPE mint
  outputMint: string;       // token you receive, e.g. USDC mint
  triggerDelta: number;     // dollars above entry (e.g. 1.0)
  swapAmountUSD: number;    // notional per trade
  enabled: boolean;
}

export interface StrategyState {
  config: StrategyConfig;
  entryPrice: number | null;
  currentPrice: number;
  lastTriggerPrice: number | null;
  totalSwaps: number;
  successfulSwaps: number;
  totalPnl: number;
  priceHistory: { time: string; price: number }[];
  tradeHistory: {
    time: string;
    action: string;
    price: number;
    pnl: number;
    txid: string;
    status: "success" | "failed";
  }[];
}

export const strategies: Record<TokenSymbol, StrategyState> = {
  HYPE: {
    config: {
      symbol: "HYPE",
      pairId: process.env.HYPE_PAIR_ID || "",
      inputMint: process.env.HYPE_MINT || "",
      outputMint: process.env.USDC_MINT || "",
      triggerDelta: parseFloat(process.env.HYPE_TRIGGER_DELTA || "1.0"),
      swapAmountUSD: parseFloat(process.env.HYPE_SWAP_USD || "1000"),
      enabled: true,
    },
    entryPrice: null,
    currentPrice: 0,
    lastTriggerPrice: null,
    totalSwaps: 0,
    successfulSwaps: 0,
    totalPnl: 0,
    priceHistory: [],
    tradeHistory: [],
  },
  // Example extra coin; copy/extend for up to 20
  COIN2: {
    config: {
      symbol: "COIN2",
      pairId: process.env.COIN2_PAIR_ID || "",
      inputMint: process.env.COIN2_MINT || "",
      outputMint: process.env.USDC_MINT || "",
      triggerDelta: parseFloat(process.env.COIN2_TRIGGER_DELTA || "1.0"),
      swapAmountUSD: parseFloat(process.env.COIN2_SWAP_USD || "1000"),
      enabled: false,
    },
    entryPrice: null,
    currentPrice: 0,
    lastTriggerPrice: null,
    totalSwaps: 0,
    successfulSwaps: 0,
    totalPnl: 0,
    priceHistory: [],
    tradeHistory: [],
  },
};

export function enableStrategy(symbol: TokenSymbol) {
  strategies[symbol].config.enabled = true;
}

export function disableStrategy(symbol: TokenSymbol) {
  strategies[symbol].config.enabled = false;
}

export function resetStrategy(symbol: TokenSymbol) {
  const s = strategies[symbol];
  s.entryPrice = null;
  s.currentPrice = 0;
  s.lastTriggerPrice = null;
  s.totalSwaps = 0;
  s.successfulSwaps = 0;
  s.totalPnl = 0;
  s.priceHistory = [];
  s.tradeHistory = [];
}