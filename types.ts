
export interface ContractStats {
  currentBalance: number;
  balanceUsdx: number;
  balanceUsdt: number;
  balanceB3: number; 
  // Liquidity Pool 1: B3 / USDX
  lpBalanceB3: number;
  lpBalanceUsdx: number;
  b3Price: number; // Real-time calculated price
  
  // Liquidity Pool 2: USDX / USDT (Stable Pair)
  lp2BalanceUsdx: number;
  lp2BalanceUsdt: number;
  stablePeg: number; // Price of USDX in USDT

  balanceUsd: number;
  volume24h: number;
  fees24h: number; // New field for estimated fees
}

export interface ChartDataPoint {
  time: string;
  value: number;
  type?: string; 
}

// User defined monitored wallet
export interface MonitoredWallet {
  address: string;
  label: string;
}

// The portfolio data for a monitored wallet
export interface WalletPortfolio extends MonitoredWallet {
  balanceXoc: number;
  balanceUsdt: number;
  balanceUsdx: number;
  balanceB3: number;
  totalValueUsd: number;
}

export interface VipAccountsData {
  portfolios: WalletPortfolio[];
}

// Mock type for wallet interactions (Drill-down feature)
export interface WalletInteraction {
  hash: string;
  method: string;
  type: 'in' | 'out';
  token: string;
  amount: number;
  time: string;
  counterparty: string;
}

// Analytics Snapshot
export interface AssetSnapshot {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  balanceUsd: number;
  timestamp: number;
}

export interface LargeTransaction {
  hash: string;
  from: string;
  to: string;
  value: number;
  symbol: 'USDX' | 'USDT';
  timestamp: number;
  blockNumber: number;
}
