
export interface ContractStats {
  currentBalance: number;
  balanceUsdx: number;
  balanceUsdt: number;
  balanceBox: number; 
  // Liquidity Pool 1: BOX / USDX
  lpBalanceBox: number;
  lpBalanceUsdx: number;
  boxPrice: number; // Real-time calculated price
  
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
  balanceBox: number;
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

export interface AddressTransaction {
  hash: string;
  from: string;
  to: string;
  value: number;
  symbol: string;
  timestamp: number;
  blockNumber: number;
  type: 'in' | 'out';
}

export interface DailySwapStats {
  todayUsdtToUsdx: number;
  todayUsdxToUsdt: number;
  yesterdayUsdtToUsdx: number;
  yesterdayUsdxToUsdt: number;
  lastUpdatedBlock: number;
}
