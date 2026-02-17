import { ContractStats } from './types';

// XONE Chain Configuration
export const RPC_URL = "https://rpc.xone.org";
export const CHAIN_ID = 1; 
export const EXPLORER_URL = "https://www.xonescan.com";
export const TARGET_CONTRACT_ADDRESS = "0x65B770A10E6e0f4754E61cA665171214949539F4";

// Token Addresses
export const USDT_ADDRESS = "0xb575796D293f37F112f3694b8ff48D711FE67EC7";
export const USDX_ADDRESS = "0x1470855EE884FA849cdA43f4C1Ef031DFd8ECb72";
export const B3_ADDRESS = "0x4917eac92fc892d0ff077fa39feee07acefd2ca6";

// LP Addresses (For Pricing)
export const B3_LP_ADDRESS = "0x3Bf6A66Ace265E972C00Fc4942DFB59F1F05395E";
// Updated USDX/USDT pair address
export const USDX_USDT_LP_ADDRESS = "0x65B770A10E6e0f4754E61cA665171214949539F4"; 

// Symbols & Pricing
export const TOKEN_SYMBOL = "XOC"; 
export const TOKEN_PRICE_USD = 1.25; 

// Initial Stats
export const INITIAL_STATS: ContractStats = {
  currentBalance: 0,
  balanceUsdx: 0,
  balanceUsdt: 0,
  balanceB3: 0,
  lpBalanceB3: 0, 
  lpBalanceUsdx: 0, 
  b3Price: 0,
  
  lp2BalanceUsdx: 0,
  lp2BalanceUsdt: 0,
  stablePeg: 1,

  balanceUsd: 0,
  volume24h: 0,
  fees24h: 0,
};