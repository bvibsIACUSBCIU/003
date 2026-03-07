import { ContractStats } from './types';

// XONE Chain Configuration
export const RPC_URL = "https://rpc.xone.org";
// Fallback RPC endpoints for resilience (XONE official nodes)
export const RPC_URLS = [
  "https://rpc.xone.org",
  "https://rpc-node-1.xone.org",
  "https://rpc-node-2.xone.org",
  "https://rpc-node-3.xone.org",
  "https://rpc-node-4.xone.org",
];
export const CHAIN_ID = 1;
export const EXPLORER_URL = "https://www.xonescan.com";
export const TARGET_CONTRACT_ADDRESS = "0x65B770A10E6e0f4754E61cA665171214949539F4";

// Token Addresses
export const USDT_ADDRESS = "0xb575796D293f37F112f3694b8ff48D711FE67EC7";
export const USDX_ADDRESS = "0x1470855EE884FA849cdA43f4C1Ef031DFd8ECb72";
export const BOX_ADDRESS = "0x2d3B35c7D701A6E50c6b354Ad649a796E3841A46";

// LP Addresses (For Pricing)
export const BOX_LP_ADDRESS = "0x9523DC9E45Dd7345b333A4014Be629b5d826B1e6";
// FlashSwap contract = USDX/USDT swap contract (same as TARGET_CONTRACT_ADDRESS)
export const FLASH_SWAP_ADDRESS = "0x65B770A10E6e0f4754E61cA665171214949539F4";
// Updated USDX/USDT pair address (same as FlashSwap)
export const USDX_USDT_LP_ADDRESS = "0x65B770A10E6e0f4754E61cA665171214949539F4";

// Symbols & Pricing
export const TOKEN_SYMBOL = "XOC";
export const TOKEN_PRICE_USD = 1.25;

// Initial Stats
export const INITIAL_STATS: ContractStats = {
  currentBalance: 0,
  balanceUsdx: 0,
  balanceUsdt: 0,
  balanceBox: 0,
  lpBalanceBox: 0,
  lpBalanceUsdx: 0,
  boxPrice: 0,

  lp2BalanceUsdx: 0,
  lp2BalanceUsdt: 0,
  stablePeg: 1,

  balanceUsd: 0,
  volume24h: 0,
  fees24h: 0,
};