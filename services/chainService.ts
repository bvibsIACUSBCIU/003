import { JsonRpcProvider, Contract, formatUnits, formatEther } from "ethers";
import {
  RPC_URLS,
  TARGET_CONTRACT_ADDRESS,
  USDT_ADDRESS,
  USDX_ADDRESS,
  BOX_ADDRESS,
  BOX_LP_ADDRESS,
  USDX_USDT_LP_ADDRESS,
  FLASH_SWAP_ADDRESS,
  TOKEN_PRICE_USD
} from "../constants";
import { ContractStats, VipAccountsData, MonitoredWallet, WalletPortfolio, LargeTransaction, AddressTransaction } from "../types";

// ============================================================
// CONSTANTS
// ============================================================
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const ERC20_TRANSFER_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"];

const STORAGE_KEY_SWAP_STATS = "xone_swap_stats_cache";
const STORAGE_KEY_CHAIN_DATA = "xone_chain_data_cache";
const STORAGE_KEY_LARGE_TXS = "xone_large_txs_cache";
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes in-memory cache
const STALE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour - use stale data when RPC fails

// ============================================================
// PERSISTENT CACHE (localStorage)
// ============================================================
function readCache<T>(key: string): { data: T, ts: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full or unavailable */ }
}

function getCachedData<T>(key: string, maxAgeMs: number = CACHE_TTL_MS): T | null {
  const cached = readCache<T>(key);
  if (!cached) return null;
  if (Date.now() - cached.ts < maxAgeMs) return cached.data;
  return null;
}

// ============================================================
// PROVIDER WITH FAILOVER
// ============================================================
let _providers: JsonRpcProvider[] = [];
let _currentProviderIdx = 0;

const buildProvider = (url: string) =>
  new JsonRpcProvider(url, undefined, { staticNetwork: true, batchMaxCount: 1 });

const getProvider = (): JsonRpcProvider => {
  if (_providers.length === 0) {
    _providers = RPC_URLS.map(buildProvider);
  }
  return _providers[_currentProviderIdx % _providers.length];
};

const rotateProvider = () => {
  _currentProviderIdx = (_currentProviderIdx + 1) % RPC_URLS.length;
  console.warn(`Rotating to RPC: ${RPC_URLS[_currentProviderIdx]}`);
};

// ============================================================
// LOCK - Prevent parallel heavy log scans
// ============================================================
let isFetchingLogs = false;
const withLogLock = async <T>(fn: () => Promise<T | null>): Promise<T | null> => {
  if (isFetchingLogs) {
    console.log("Log fetch already in progress, skipping until done.");
    return null;
  }
  isFetchingLogs = true;
  try {
    return await fn();
  } finally {
    setTimeout(() => { isFetchingLogs = false; }, 5000);
  }
};

// ============================================================
// RETRY WITH PROVIDER ROTATION
// ============================================================
const retryOperation = async <T>(
  operation: (provider: JsonRpcProvider) => Promise<T>,
  retries = 3,
  baseDelay = 1500
): Promise<T> => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await operation(getProvider());
    } catch (error: any) {
      const is429 = error?.message?.includes("429") || error?.message?.includes("limit");
      const isFetch = error?.message?.includes("Failed to fetch") || error?.message?.includes("CORS");

      if (isFetch || is429) {
        rotateProvider();
      }

      if (i === retries) throw error;

      const delay = is429 ? 8000 : baseDelay * Math.pow(2, i);
      console.warn(`Attempt ${i + 1}/${retries} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("All retries exhausted");
};

// ============================================================
// LOG FETCHING - adaptive chunking
// ============================================================
const fetchLogsInChunks = async (
  contract: Contract,
  filter: any,
  startBlock: number,
  endBlock: number
): Promise<any[]> => {
  const allLogs: any[] = [];
  let currentStart = startBlock;
  let chunkSize = 500;

  while (currentStart <= endBlock) {
    const currentEnd = Math.min(currentStart + chunkSize - 1, endBlock);
    try {
      const logs = await contract.queryFilter(filter, currentStart, currentEnd);
      allLogs.push(...logs);
      currentStart = currentEnd + 1;
      // Small delay to avoid hammering the RPC
      await new Promise(r => setTimeout(r, 300));
    } catch (e: any) {
      const is429 = e?.message?.includes("429") || e?.message?.includes("limit");
      const isFetch = e?.message?.includes("Failed to fetch") || e?.message?.includes("CORS");

      if (isFetch) {
        rotateProvider();
        console.warn("RPC fetch failed during log scan, rotating provider...");
        // Recreate contract with new provider
        contract = contract.connect(getProvider()) as Contract;
        await new Promise(r => setTimeout(r, 3000));
      } else if (is429) {
        console.warn("Rate limited during log scan, backing off 8s...");
        await new Promise(r => setTimeout(r, 8000));
      }

      chunkSize = Math.max(1, Math.floor(chunkSize / 2));
      if (chunkSize < 5) {
        console.error(`Chunk too small at block ${currentStart}, skipping.`);
        currentStart += 50; // skip a small batch and continue
        chunkSize = 100;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return allLogs;
};

const throttlePromises = async <T>(items: any[], fn: (item: any) => Promise<T>, limit: number): Promise<T[]> => {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...await Promise.all(chunk.map(fn)));
    await new Promise(r => setTimeout(r, 800));
  }
  return results;
};

// ============================================================
// FLASHSWAP LOG CACHE (in-memory + localStorage)
// ============================================================
// The FlashSwap contract (0x65B770A10E6e0f4754E61cA665171214949539F4) performs
// USDT<>USDX swaps via ERC-20 Transfer events, NOT standard UniswapV2 Swap events.
//
//  USDT→USDX: user sends USDT to FlashSwap → Transfer(from=user, to=FlashSwap, token=USDT)
//  USDX→USDT: user sends USDX to FlashSwap → Transfer(from=user, to=FlashSwap, token=USDX)

interface SwapLogEntry {
  blockNumber: number;
  from: string;
  amount: string;   // raw BigInt string
  decimals: number;
  txHash: string;
}

interface SwapTransferCache {
  usdtIn: SwapLogEntry[];
  usdxIn: SwapLogEntry[];
  fromBlock: number;
  toBlock: number;
  timestamp: number;
}

let memSwapLogs: SwapTransferCache | null = null;

const getSwapTransferLogs = async (provider: JsonRpcProvider): Promise<SwapTransferCache | null> => {
  const now = Date.now();

  // 1. Return fresh in-memory cache
  if (memSwapLogs && (now - memSwapLogs.timestamp < CACHE_TTL_MS)) {
    console.log(`✓ In-memory swap cache (${memSwapLogs.usdtIn.length} USDT, ${memSwapLogs.usdxIn.length} USDX)`);
    return memSwapLogs;
  }

  // 2. Return localStorage cache if not too stale
  const stored = getCachedData<SwapTransferCache>(STORAGE_KEY_SWAP_STATS, CACHE_TTL_MS);
  if (stored) {
    console.log(`✓ localStorage swap cache (${stored.usdtIn.length} USDT, ${stored.usdxIn.length} USDX)`);
    memSwapLogs = stored;
    return stored;
  }

  // 3. Fetch from chain
  return await withLogLock(async () => {
    try {
      console.log("🔄 Fetching FlashSwap Transfer logs from chain...");
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 34560); // ~24h + buffer

      const usdtContract = new Contract(USDT_ADDRESS, ERC20_TRANSFER_ABI, provider);
      const usdxContract = new Contract(USDX_ADDRESS, ERC20_TRANSFER_ABI, provider);

      const usdtFilter = usdtContract.filters.Transfer(null, FLASH_SWAP_ADDRESS);
      const usdxFilter = usdxContract.filters.Transfer(null, FLASH_SWAP_ADDRESS);

      console.log("  Fetching USDT→FlashSwap...");
      const usdtRawLogs = await fetchLogsInChunks(usdtContract, usdtFilter, fromBlock, currentBlock);
      console.log(`  ✓ ${usdtRawLogs.length} USDT logs`);

      console.log("  Fetching USDX→FlashSwap...");
      const usdxRawLogs = await fetchLogsInChunks(usdxContract, usdxFilter, fromBlock, currentBlock);
      console.log(`  ✓ ${usdxRawLogs.length} USDX logs`);

      const toSwapEntry = (log: any, decimals: number): SwapLogEntry | null => {
        if (!log.args) return null;
        return {
          blockNumber: log.blockNumber,
          from: log.args[0],
          amount: log.args[2].toString(),
          decimals,
          txHash: log.transactionHash,
        };
      };

      const result: SwapTransferCache = {
        usdtIn: usdtRawLogs.map(l => toSwapEntry(l, 6)).filter(Boolean) as SwapLogEntry[],
        usdxIn: usdxRawLogs.map(l => toSwapEntry(l, 18)).filter(Boolean) as SwapLogEntry[],
        fromBlock,
        toBlock: currentBlock,
        timestamp: now,
      };

      memSwapLogs = result;
      writeCache(STORAGE_KEY_SWAP_STATS, result);
      return result;

    } catch (e) {
      console.error("FlashSwap log fetch failed:", e);

      // FALLBACK: return stale localStorage data rather than nothing
      const stale = getCachedData<SwapTransferCache>(STORAGE_KEY_SWAP_STATS, STALE_CACHE_TTL_MS);
      if (stale) {
        console.warn("⚠️ Returning stale swap cache (up to 1h old) due to RPC error");
        return stale;
      }
      return null;
    }
  });
};

// ============================================================
// BLOCK ESTIMATION
// ============================================================
const estimateBlockByTimestamp = async (provider: JsonRpcProvider, targetTimestampSec: number): Promise<number> => {
  try {
    const currentBlock = await provider.getBlockNumber();
    const currentBlockData = await provider.getBlock(currentBlock);
    if (!currentBlockData) return currentBlock;

    const avgBlockTime = 3.0; // XONE ≈ 3s/block
    let estimate = currentBlock - Math.floor((currentBlockData.timestamp - targetTimestampSec) / avgBlockTime);
    estimate = Math.max(0, estimate);

    try {
      const block = await provider.getBlock(estimate);
      if (block) {
        estimate += Math.floor((targetTimestampSec - block.timestamp) / avgBlockTime);
      }
    } catch { /* refinement is optional */ }

    return Math.min(Math.max(0, estimate), currentBlock);
  } catch (e) {
    console.warn("Block estimation failed:", e);
    const currentBlock = await getProvider().getBlockNumber().catch(() => 0);
    return Math.max(0, currentBlock - 28800);
  }
};

// ============================================================
// TOKEN BALANCE HELPER
// ============================================================
const fetchTokenBalance = async (tokenAddress: string, walletAddress: string): Promise<number> => {
  try {
    const provider = getProvider();
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
    const wei = await retryOperation(p => new Contract(tokenAddress, ERC20_ABI, p).balanceOf(walletAddress));
    let decimals = tokenAddress === USDT_ADDRESS ? 6 : 18;
    try { decimals = await retryOperation(p => new Contract(tokenAddress, ERC20_ABI, p).decimals()); } catch { }
    return parseFloat(formatUnits(wei, decimals));
  } catch (e) {
    console.warn(`Balance fetch failed for ${tokenAddress} @ ${walletAddress}`);
    return 0;
  }
};

// ============================================================
// fetchRealChainData
// ============================================================
export const fetchRealChainData = async (
  monitoredWallets: MonitoredWallet[] = [],
  fetchVolume: boolean = true
): Promise<{ stats: Partial<ContractStats>, vipData: VipAccountsData }> => {
  const emptyResult = { stats: {}, vipData: { portfolios: [] } };
  try {
    const provider = getProvider();

    // 1. Native XOC balance
    const balanceWei = await retryOperation(p => p.getBalance(TARGET_CONTRACT_ADDRESS));
    const balanceXoc = parseFloat(formatEther(balanceWei));

    // 2. Token balances of master contract
    const balanceUsdt = await fetchTokenBalance(USDT_ADDRESS, TARGET_CONTRACT_ADDRESS);
    const balanceUsdx = await fetchTokenBalance(USDX_ADDRESS, TARGET_CONTRACT_ADDRESS);
    const balanceBox = await fetchTokenBalance(BOX_ADDRESS, TARGET_CONTRACT_ADDRESS);

    // 3. BOX/USDX LP balances
    const lpBalanceBox = await fetchTokenBalance(BOX_ADDRESS, BOX_LP_ADDRESS);
    const lpBalanceUsdx = await fetchTokenBalance(USDX_ADDRESS, BOX_LP_ADDRESS);

    // 4. FlashSwap contract balances (USDX/USDT pool)
    const lp2BalanceUsdx = await fetchTokenBalance(USDX_ADDRESS, USDX_USDT_LP_ADDRESS);
    const lp2BalanceUsdt = await fetchTokenBalance(USDT_ADDRESS, USDX_USDT_LP_ADDRESS);

    // 5. Derived prices
    const boxPrice = lpBalanceBox > 0 && lpBalanceUsdx > 0 ? lpBalanceUsdx / lpBalanceBox : 0;
    const stablePeg = 1; // USDX/USDT is a stable swap pool; peg is fixed at 1:1
    const totalUsd = (balanceXoc * TOKEN_PRICE_USD) + balanceUsdt + balanceUsdx + (balanceBox * boxPrice);

    // 6. 24h volume from FlashSwap logs
    let volume24h = 0;
    let fees24h = 0;

    if (fetchVolume) {
      try {
        const logs = await getSwapTransferLogs(provider);
        if (logs) {
          const usdtVol = logs.usdtIn.reduce((s, l) => s + parseFloat(formatUnits(BigInt(l.amount), l.decimals)), 0);
          const usdxVol = logs.usdxIn.reduce((s, l) => s + parseFloat(formatUnits(BigInt(l.amount), l.decimals)), 0);
          volume24h = usdtVol + usdxVol;
          fees24h = volume24h * 0.003;
        }
      } catch (e) { console.error("Volume calc failed:", e); }
    }

    // 7. Monitored wallet portfolios
    const processWallet = async (wallet: MonitoredWallet) => {
      try {
        const xocWei = await retryOperation(p => p.getBalance(wallet.address));
        const balXoc = parseFloat(formatEther(xocWei));
        const [balUsdt, balUsdx, balBox] = await Promise.all([
          fetchTokenBalance(USDT_ADDRESS, wallet.address),
          fetchTokenBalance(USDX_ADDRESS, wallet.address),
          fetchTokenBalance(BOX_ADDRESS, wallet.address),
        ]);
        const totalValueUsd = (balXoc * TOKEN_PRICE_USD) + balUsdt + balUsdx + (balBox * boxPrice);
        return { ...wallet, balanceXoc: balXoc, balanceUsdt, balanceUsdx, balanceBox: balBox, totalValueUsd };
      } catch {
        return { ...wallet, balanceXoc: 0, balanceUsdt: 0, balanceUsdx: 0, balanceBox: 0, totalValueUsd: 0 };
      }
    };

    const portfolios = await throttlePromises(monitoredWallets, processWallet, 2);
    portfolios.sort((a, b) => b.totalValueUsd - a.totalValueUsd);

    const result = {
      stats: {
        currentBalance: balanceXoc,
        balanceUsdt, balanceUsdx, balanceBox,
        lpBalanceBox, lpBalanceUsdx, boxPrice,
        lp2BalanceUsdx, lp2BalanceUsdt, stablePeg,
        balanceUsd: totalUsd, volume24h, fees24h,
      },
      vipData: { portfolios },
    };

    writeCache(STORAGE_KEY_CHAIN_DATA, result);
    return result;

  } catch (error) {
    console.error("fetchRealChainData failed:", error);
    // Fall back to stale localStorage data
    const stale = getCachedData<{ stats: Partial<ContractStats>, vipData: VipAccountsData }>(
      STORAGE_KEY_CHAIN_DATA, STALE_CACHE_TTL_MS
    );
    if (stale) { console.warn("⚠️ Returning stale chain data"); return stale; }
    return emptyResult;
  }
};

// ============================================================
// fetchLargeTransactions
// ============================================================
export const fetchLargeTransactions = async (): Promise<LargeTransaction[]> => {
  try {
    const provider = getProvider();
    const currentBlock = await retryOperation(p => p.getBlockNumber());
    const logs = await getSwapTransferLogs(provider);

    if (!logs) {
      const stale = getCachedData<LargeTransaction[]>(STORAGE_KEY_LARGE_TXS, STALE_CACHE_TTL_MS);
      return stale || [];
    }

    const now = Date.now();
    const transactions: LargeTransaction[] = [];

    for (const log of logs.usdtIn) {
      const value = parseFloat(formatUnits(BigInt(log.amount), log.decimals));
      if (value > 1000) {
        transactions.push({
          hash: log.txHash,
          from: log.from,
          to: FLASH_SWAP_ADDRESS,
          value,
          symbol: 'USDT' as 'USDT' | 'USDX',
          timestamp: now - ((currentBlock - log.blockNumber) * 3000),
          blockNumber: log.blockNumber,
        });
      }
    }

    for (const log of logs.usdxIn) {
      const value = parseFloat(formatUnits(BigInt(log.amount), log.decimals));
      if (value > 1000) {
        transactions.push({
          hash: log.txHash,
          from: log.from,
          to: FLASH_SWAP_ADDRESS,
          value,
          symbol: 'USDX' as 'USDT' | 'USDX',
          timestamp: now - ((currentBlock - log.blockNumber) * 3000),
          blockNumber: log.blockNumber,
        });
      }
    }

    const sorted = transactions.sort((a, b) => b.blockNumber - a.blockNumber);
    writeCache(STORAGE_KEY_LARGE_TXS, sorted);
    return sorted;

  } catch (error) {
    console.error("fetchLargeTransactions failed:", error);
    const stale = getCachedData<LargeTransaction[]>(STORAGE_KEY_LARGE_TXS, STALE_CACHE_TTL_MS);
    return stale || [];
  }
};

// ============================================================
// fetchAddressHistory
// ============================================================
export const fetchAddressHistory = async (address: string): Promise<{
  portfolio: WalletPortfolio | null,
  transactions: AddressTransaction[]
}> => {
  try {
    const provider = getProvider();

    const xocWei = await retryOperation(p => p.getBalance(address));
    const balXoc = parseFloat(formatEther(xocWei));
    const balUsdt = await fetchTokenBalance(USDT_ADDRESS, address);
    const balUsdx = await fetchTokenBalance(USDX_ADDRESS, address);
    const balBox = await fetchTokenBalance(BOX_ADDRESS, address);

    const lpBalBox = await fetchTokenBalance(BOX_ADDRESS, BOX_LP_ADDRESS);
    const lpBalUsdx = await fetchTokenBalance(USDX_ADDRESS, BOX_LP_ADDRESS);
    const boxPrice = lpBalBox > 0 && lpBalUsdx > 0 ? lpBalUsdx / lpBalBox : 0;
    const totalVal = (balXoc * TOKEN_PRICE_USD) + balUsdt + balUsdx + (balBox * boxPrice);

    const portfolio: WalletPortfolio = {
      address,
      label: 'Monitored Address',
      balanceXoc: balXoc,
      balanceUsdt: balUsdt,
      balanceUsdx: balUsdx,
      balanceBox: balBox,
      totalValueUsd: totalVal,
    };

    const currentBlock = await retryOperation(p => p.getBlockNumber());
    const fromBlock = Math.max(0, currentBlock - 100000);

    const tokens = [
      { address: USDT_ADDRESS, symbol: 'USDT', decimals: 6 },
      { address: USDX_ADDRESS, symbol: 'USDX', decimals: 18 },
      { address: BOX_ADDRESS, symbol: 'BOX', decimals: 18 },
    ];

    const transactions: AddressTransaction[] = [];
    const blockCache: Record<number, number> = {};

    for (const token of tokens) {
      const contract = new Contract(token.address, ERC20_TRANSFER_ABI, provider);

      const processLogs = async (logs: any[], type: 'in' | 'out') => {
        for (const log of logs) {
          if ('args' in log) {
            const value = parseFloat(formatUnits(log.args[2], token.decimals));
            let timestamp = blockCache[log.blockNumber];
            if (!timestamp) {
              try {
                const block: any = await retryOperation(p => p.getBlock(log.blockNumber));
                timestamp = block ? block.timestamp * 1000 : Date.now();
                blockCache[log.blockNumber] = timestamp;
              } catch { timestamp = Date.now(); }
            }
            transactions.push({
              hash: log.transactionHash,
              from: log.args[0],
              to: log.args[1],
              value,
              symbol: token.symbol,
              timestamp,
              blockNumber: log.blockNumber,
              type,
            });
          }
        }
      };

      const filterIn = contract.filters.Transfer(null, address);
      const filterOut = contract.filters.Transfer(address, null);
      await processLogs(await fetchLogsInChunks(contract, filterIn, fromBlock, currentBlock), 'in');
      await processLogs(await fetchLogsInChunks(contract, filterOut, fromBlock, currentBlock), 'out');
    }

    return { portfolio, transactions: transactions.sort((a, b) => b.timestamp - a.timestamp) };

  } catch (error) {
    console.error("fetchAddressHistory failed:", error);
    return { portfolio: null, transactions: [] };
  }
};

// ============================================================
// fetchDailySwapStats  ← THE KEY FUNCTION
// ============================================================
export const fetchDailySwapStats = async (): Promise<{
  todayUsdtToUsdx: number,
  todayUsdxToUsdt: number,
  yesterdayUsdtToUsdx: number,
  yesterdayUsdxToUsdt: number,
  lastUpdatedBlock: number,
}> => {
  const STATS_STORAGE_KEY = "xone_daily_swap_stats_processed";
  const empty = { todayUsdtToUsdx: 0, todayUsdxToUsdt: 0, yesterdayUsdtToUsdx: 0, yesterdayUsdxToUsdt: 0, lastUpdatedBlock: 0 };

  try {
    const provider = getProvider();

    // 1. Get current block time for day boundary
    let currentBlock = 0;
    let currentTimestampSec = Math.floor(Date.now() / 1000);

    try {
      currentBlock = await retryOperation(p => p.getBlockNumber());
      const blockData = await retryOperation(p => p.getBlock(currentBlock));
      if (blockData) currentTimestampSec = blockData.timestamp;
    } catch (e) {
      console.warn("Could not fetch current block, using system time for day boundaries");
      // Use system time as fallback — blocks still filterable
    }

    // 2. Calculate today/yesterday boundaries (UTC+8 Beijing)
    const UTC8 = 8 * 3600;
    const nowUtc8Ms = (currentTimestampSec + UTC8) * 1000;
    const todayStartUtcSec = new Date(nowUtc8Ms).setUTCHours(0, 0, 0, 0) / 1000 - UTC8;
    const yesterdayStartUtcSec = todayStartUtcSec - 86400;

    // 3. Estimate block numbers
    let todayStartBlock = 0;
    let yesterdayStartBlock = 0;
    try {
      [todayStartBlock, yesterdayStartBlock] = await Promise.all([
        estimateBlockByTimestamp(provider, todayStartUtcSec),
        estimateBlockByTimestamp(provider, yesterdayStartUtcSec),
      ]);
      console.log(`📅 Blocks → yesterday: ${yesterdayStartBlock}, today: ${todayStartBlock}, current: ${currentBlock}`);
    } catch (e) {
      console.warn("Block estimation failed, using approximate values");
      todayStartBlock = Math.max(0, currentBlock - 28800);
      yesterdayStartBlock = Math.max(0, currentBlock - 57600);
    }

    // 4. Get swap Transfer logs (with localStorage fallback)
    const swapLogs = await getSwapTransferLogs(provider);

    if (!swapLogs) {
      // Try stale processed stats cache
      const stale = getCachedData<typeof empty>(STATS_STORAGE_KEY, STALE_CACHE_TTL_MS);
      if (stale) { console.warn("⚠️ Returning stale daily stats"); return stale; }
      return { ...empty, lastUpdatedBlock: currentBlock };
    }

    // 5. Aggregate by time window
    const stats = { ...empty, lastUpdatedBlock: currentBlock };

    for (const log of swapLogs.usdtIn) {
      const val = parseFloat(formatUnits(BigInt(log.amount), log.decimals));
      if (log.blockNumber >= todayStartBlock) {
        stats.todayUsdtToUsdx += val;
      } else if (log.blockNumber >= yesterdayStartBlock) {
        stats.yesterdayUsdtToUsdx += val;
      }
    }

    for (const log of swapLogs.usdxIn) {
      const val = parseFloat(formatUnits(BigInt(log.amount), log.decimals));
      if (log.blockNumber >= todayStartBlock) {
        stats.todayUsdxToUsdt += val;
      } else if (log.blockNumber >= yesterdayStartBlock) {
        stats.yesterdayUsdxToUsdt += val;
      }
    }

    console.log(`✅ Today  USDT→USDX: ${stats.todayUsdtToUsdx.toFixed(2)}, USDX→USDT: ${stats.todayUsdxToUsdt.toFixed(2)}`);
    console.log(`✅ Yest.  USDT→USDX: ${stats.yesterdayUsdtToUsdx.toFixed(2)}, USDX→USDT: ${stats.yesterdayUsdxToUsdt.toFixed(2)}`);

    // Persist processed result for instant reads next time
    writeCache(STATS_STORAGE_KEY, stats);
    return stats;

  } catch (e) {
    console.error("Error in fetchDailySwapStats:", e);

    // Always return last known good data if available
    const stale = getCachedData<typeof empty>("xone_daily_swap_stats_processed", STALE_CACHE_TTL_MS);
    if (stale) { console.warn("⚠️ Returning stale daily stats due to error"); return stale; }

    return empty;
  }
};