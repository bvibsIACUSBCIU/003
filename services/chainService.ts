import { JsonRpcProvider, Contract, formatUnits, formatEther } from "ethers";
import { 
  RPC_URL, 
  TARGET_CONTRACT_ADDRESS, 
  USDT_ADDRESS, 
  USDX_ADDRESS,
  BOX_ADDRESS,
  BOX_LP_ADDRESS,
  USDX_USDT_LP_ADDRESS,
  TOKEN_PRICE_USD
} from "../constants";
import { ContractStats, VipAccountsData, MonitoredWallet, WalletPortfolio, LargeTransaction, AddressTransaction } from "../types";

// Standard ERC20 ABI for balanceOf
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Singleton Provider
let _provider: JsonRpcProvider | null = null;
const getProvider = () => {
  if (!_provider) {
    _provider = new JsonRpcProvider(RPC_URL, undefined, {
      staticNetwork: true, // Optimization for known networks
      batchMaxCount: 1, // Disable batching to avoid large payloads failing
    });
  }
  return _provider;
};

// Helper to fetch logs with adaptive chunking
const fetchLogsInChunks = async (contract: Contract, filter: any, startBlock: number, endBlock: number) => {
  const allLogs: any[] = [];
  let currentStart = startBlock;
  let chunkSize = 100; // Start with a conservative chunk size

  while (currentStart <= endBlock) {
    const currentEnd = Math.min(currentStart + chunkSize - 1, endBlock);
    
    try {
      // Attempt to fetch logs for the current chunk
      const logs = await contract.queryFilter(filter, currentStart, currentEnd);
      allLogs.push(...logs);
      
      // Success: Move to next chunk
      currentStart = currentEnd + 1;
      
      // If successful, we can try to slightly increase chunk size to speed up, 
      // but cap it at 500 to avoid hitting limits again.
      if (chunkSize < 500) {
        chunkSize = Math.min(chunkSize * 2, 500);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50)); 

    } catch (e: any) {
      console.warn(`Failed to fetch logs ${currentStart}-${currentEnd} (Size: ${chunkSize}). Retrying with smaller chunk...`);
      
      // Halve the chunk size
      chunkSize = Math.floor(chunkSize / 2);
      
      // If chunk size gets too small (0), we failed even with a single block
      if (chunkSize < 1) {
        console.error(`Failed to fetch block ${currentStart}. Skipping block to proceed.`);
        currentStart++; // Skip just this block
        chunkSize = 5; // Reset chunk size to try to recover speed
      } else {
        // Add a backoff delay before retrying the same start block with smaller chunk
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return allLogs;
};

// Helper to throttle promises
const throttlePromises = async <T>(items: any[], fn: (item: any) => Promise<T>, limit: number): Promise<T[]> => {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
    await new Promise(resolve => setTimeout(resolve, 200)); // Delay between batches
  }
  return results;
};

// Generic Retry Helper
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, baseDelay = 1000): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === retries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i); // Exponential backoff: 1s, 2s, 4s
      console.warn(`Operation failed, retrying (${i + 1}/${retries}) in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Operation failed after retries");
};

export const fetchRealChainData = async (
  monitoredWallets: MonitoredWallet[] = [],
  fetchVolume: boolean = true
): Promise<{stats: Partial<ContractStats>, vipData: VipAccountsData}> => {
  try {
    const provider = getProvider();

    // 1. Fetch Native Token (XOC) Balance of Target Contract
    const balanceWei = await retryOperation(() => provider.getBalance(TARGET_CONTRACT_ADDRESS));
    const balanceXoc = parseFloat(formatEther(balanceWei));

    // Helper to fetch token data with retry
    const fetchTokenBalance = async (tokenAddress: string, walletAddress: string) => {
      const contract = new Contract(tokenAddress, ERC20_ABI, provider);
      try {
        const wei = await retryOperation(() => contract.balanceOf(walletAddress));
        let decimals = 18;
        try { 
            decimals = await retryOperation(() => contract.decimals()); 
        } catch (e) {
          if(tokenAddress === USDT_ADDRESS) decimals = 6; 
          if(tokenAddress === USDX_ADDRESS) decimals = 18;
        }
        return parseFloat(formatUnits(wei, decimals));
      } catch (e) {
        console.warn(`Failed to fetch balance for ${walletAddress} on ${tokenAddress}`);
        return 0;
      }
    };

    // 2. Fetch Target Contract Balances
    const balanceUsdt = await fetchTokenBalance(USDT_ADDRESS, TARGET_CONTRACT_ADDRESS);
    const balanceUsdx = await fetchTokenBalance(USDX_ADDRESS, TARGET_CONTRACT_ADDRESS);
    const balanceBox = await fetchTokenBalance(BOX_ADDRESS, TARGET_CONTRACT_ADDRESS);

    // 3. Fetch LP Contract Balances (BOX/USDX)
    const lpBalanceBox = await fetchTokenBalance(BOX_ADDRESS, BOX_LP_ADDRESS);
    const lpBalanceUsdx = await fetchTokenBalance(USDX_ADDRESS, BOX_LP_ADDRESS);

    // 4. Fetch LP 2 Contract Balances (USDX/USDT)
    const lp2BalanceUsdx = await fetchTokenBalance(USDX_ADDRESS, USDX_USDT_LP_ADDRESS);
    const lp2BalanceUsdt = await fetchTokenBalance(USDT_ADDRESS, USDX_USDT_LP_ADDRESS);

    // 5. Calculate Real-Time Price & Peg
    let boxPrice = 0;
    if (lpBalanceBox > 0 && lpBalanceUsdx > 0) {
      boxPrice = lpBalanceUsdx / lpBalanceBox;
    }

    let stablePeg = 1;
    if (lp2BalanceUsdx > 0 && lp2BalanceUsdt > 0) {
      stablePeg = lp2BalanceUsdt / lp2BalanceUsdx; // Price of 1 USDX in USDT
    }

    const totalUsd = (balanceXoc * TOKEN_PRICE_USD) + balanceUsdt + balanceUsdx + (balanceBox * boxPrice);

    // 6. Calculate 24h Volume (Real Data)
    let volume24h = 0;
    let fees24h = 0;

    if (fetchVolume) {
        try {
            const currentBlock = await retryOperation(() => provider.getBlockNumber());
            const blocks24h = 28800; // ~24h @ 3s/block
            const fromBlock = Math.max(0, currentBlock - blocks24h);

            const getPairVolume = async (lpAddress: string, quoteToken: string, quoteDecimals: number) => {
                try {
                    const lpContract = new Contract(lpAddress, [
                        "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
                        "function token0() view returns (address)"
                    ], provider);

                    let token0 = "";
                    try { 
                        token0 = await retryOperation(() => lpContract.token0()); 
                    } catch { 
                        // Fallback
                        token0 = quoteToken.toLowerCase() < (lpAddress === BOX_LP_ADDRESS ? BOX_ADDRESS : USDT_ADDRESS).toLowerCase() ? quoteToken : (lpAddress === BOX_LP_ADDRESS ? BOX_ADDRESS : USDT_ADDRESS);
                    }
                    
                    const isQuoteToken0 = token0.toLowerCase() === quoteToken.toLowerCase();
                    const filter = lpContract.filters.Swap();
                    const logs = await fetchLogsInChunks(lpContract, filter, fromBlock, currentBlock);
                    
                    let vol = 0;
                    for (const log of logs) {
                        if ('args' in log) {
                            // @ts-ignore
                            const args = log.args;
                            if (isQuoteToken0) {
                                const inVal = parseFloat(formatUnits(args[1], quoteDecimals));
                                const outVal = parseFloat(formatUnits(args[3], quoteDecimals));
                                vol += inVal + outVal;
                            } else {
                                const inVal = parseFloat(formatUnits(args[2], quoteDecimals));
                                const outVal = parseFloat(formatUnits(args[4], quoteDecimals));
                                vol += inVal + outVal;
                            }
                        }
                    }
                    return vol;
                } catch (e) {
                    console.warn(`Failed to fetch volume for ${lpAddress}`, e);
                    return 0;
                }
            };

            // Execute sequentially to reduce RPC load
            const volBox = await getPairVolume(BOX_LP_ADDRESS, USDX_ADDRESS, 18);
            const volStable = await getPairVolume(USDX_USDT_LP_ADDRESS, USDT_ADDRESS, 6);
            
            volume24h = volBox + volStable;
            fees24h = volume24h * 0.003;
        } catch (e) {
            console.error("Failed to calculate 24h volume", e);
            // Fallback to 0 if calculation fails
        }
    }

    // 7. Fetch Portfolios for Monitored Wallets (Throttled)
    const processWallet = async (wallet: MonitoredWallet) => {
      try {
        // Native XOC
        const xocWei = await retryOperation(() => provider.getBalance(wallet.address));
        const balXoc = parseFloat(formatEther(xocWei));
        
        // Tokens
        const balUsdt = await fetchTokenBalance(USDT_ADDRESS, wallet.address);
        const balUsdx = await fetchTokenBalance(USDX_ADDRESS, wallet.address);
        const balBox = await fetchTokenBalance(BOX_ADDRESS, wallet.address);
        
        // Est Total Value (Simple approx)
        const totalVal = (balXoc * TOKEN_PRICE_USD) + balUsdt + balUsdx + (balBox * boxPrice);

        return {
          ...wallet,
          balanceXoc: balXoc,
          balanceUsdt: balUsdt,
          balanceUsdx: balUsdx,
          balanceBox: balBox,
          totalValueUsd: totalVal
        };
      } catch (e) {
        // Return zeros if invalid address or error
        return {
          ...wallet,
          balanceXoc: 0,
          balanceUsdt: 0,
          balanceUsdx: 0,
          balanceBox: 0,
          totalValueUsd: 0
        };
      }
    };

    const portfolios = await throttlePromises(monitoredWallets, processWallet, 2); // Process 2 wallets at a time

    // Sort portfolios by total value desc
    portfolios.sort((a, b) => b.totalValueUsd - a.totalValueUsd);

    return {
      stats: {
        currentBalance: balanceXoc,
        balanceUsdt,
        balanceUsdx,
        balanceBox,
        lpBalanceBox,
        lpBalanceUsdx,
        boxPrice,
        lp2BalanceUsdx,
        lp2BalanceUsdt,
        stablePeg,
        balanceUsd: totalUsd,
        volume24h,
        fees24h
      },
      vipData: {
        portfolios
      }
    };

  } catch (error) {
    console.error("Failed to fetch chain data:", error);
    return { 
      stats: {}, 
      vipData: { portfolios: [] } 
    };
  }
};

export const fetchLargeTransactions = async (): Promise<LargeTransaction[]> => {
  try {
    const provider = getProvider();
    
    // Contracts
    const usdxContract = new Contract(USDX_ADDRESS, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);
    const usdtContract = new Contract(USDT_ADDRESS, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);
    
    // Get current block
    const currentBlock = await retryOperation(() => provider.getBlockNumber());
    // Look back ~24 hours (assuming 3s block time -> ~28800 blocks)
    const fromBlock = Math.max(0, currentBlock - 28800); 

    // 1. Fetch USDX -> LP (Selling USDX)
    const filterUsdx = usdxContract.filters.Transfer(null, USDX_USDT_LP_ADDRESS);
    const logsUsdx = await fetchLogsInChunks(usdxContract, filterUsdx, fromBlock, currentBlock);

    // 2. Fetch USDT -> LP (Buying USDX)
    const filterUsdt = usdtContract.filters.Transfer(null, USDX_USDT_LP_ADDRESS);
    const logsUsdt = await fetchLogsInChunks(usdtContract, filterUsdt, fromBlock, currentBlock);

    const transactions: LargeTransaction[] = [];
    const blockCache: Record<number, number> = {};

    // Helper to process logs
    const processLogs = async (logs: any[], symbol: 'USDX' | 'USDT', decimals: number) => {
      for (const log of logs) {
        if ('args' in log) {
          // @ts-ignore
          const value = parseFloat(formatUnits(log.args[2], decimals));
          
          // Threshold: > 1000
          if (value > 1000) {
            let timestamp = blockCache[log.blockNumber];
            if (!timestamp) {
              const block = await retryOperation(() => log.getBlock()) as any;
              if (block) {
                timestamp = block.timestamp * 1000;
                blockCache[log.blockNumber] = timestamp;
              } else {
                timestamp = Date.now();
              }
            }

            transactions.push({
              hash: log.transactionHash,
              from: log.args[0],
              to: log.args[1],
              value: value,
              symbol: symbol,
              timestamp: timestamp,
              blockNumber: log.blockNumber
            });
          }
        }
      }
    };

    // Process logs sequentially
    await processLogs(logsUsdx, 'USDX', 18);
    await processLogs(logsUsdt, 'USDT', 6);

    // Sort by timestamp desc
    return transactions.sort((a, b) => b.timestamp - a.timestamp);

  } catch (error) {
    console.error("Failed to fetch large transactions:", error);
    return [];
  }
};

export const fetchAddressHistory = async (address: string): Promise<{
  portfolio: WalletPortfolio | null,
  transactions: AddressTransaction[]
}> => {
  try {
    const provider = getProvider();

    // Helper to fetch token balance
    const fetchTokenBalance = async (tokenAddress: string, walletAddress: string) => {
      const contract = new Contract(tokenAddress, ERC20_ABI, provider);
      try {
        const wei = await retryOperation(() => contract.balanceOf(walletAddress));
        let decimals = 18;
        try { 
            decimals = await retryOperation(() => contract.decimals()); 
        } catch (e) {
          if(tokenAddress === USDT_ADDRESS) decimals = 6; 
          if(tokenAddress === USDX_ADDRESS) decimals = 18;
        }
        return parseFloat(formatUnits(wei, decimals));
      } catch (e) {
        return 0; 
      }
    };

    // 1. Fetch Balances
    const xocWei = await retryOperation(() => provider.getBalance(address));
    const balXoc = parseFloat(formatEther(xocWei));
    const balUsdt = await fetchTokenBalance(USDT_ADDRESS, address);
    const balUsdx = await fetchTokenBalance(USDX_ADDRESS, address);
    const balBox = await fetchTokenBalance(BOX_ADDRESS, address);

    // Calculate Price for Total Value
    // Need BOX price... fetch from LP
    const lpContract = new Contract(BOX_LP_ADDRESS, ERC20_ABI, provider); // Just need balanceOf
    const lpBalBox = await fetchTokenBalance(BOX_ADDRESS, BOX_LP_ADDRESS);
    const lpBalUsdx = await fetchTokenBalance(USDX_ADDRESS, BOX_LP_ADDRESS);
    let boxPrice = 0;
    if (lpBalBox > 0 && lpBalUsdx > 0) boxPrice = lpBalUsdx / lpBalBox;

    const totalVal = (balXoc * TOKEN_PRICE_USD) + balUsdt + balUsdx + (balBox * boxPrice);

    const portfolio: WalletPortfolio = {
      address,
      label: 'Monitored Address',
      balanceXoc: balXoc,
      balanceUsdt: balUsdt,
      balanceUsdx: balUsdx,
      balanceBox: balBox,
      totalValueUsd: totalVal
    };

    // 2. Fetch Transactions (Last ~100k blocks)
    const currentBlock = await retryOperation(() => provider.getBlockNumber());
    const fromBlock = Math.max(0, currentBlock - 100000); 

    const tokens = [
      { address: USDT_ADDRESS, symbol: 'USDT', decimals: 6 },
      { address: USDX_ADDRESS, symbol: 'USDX', decimals: 18 },
      { address: BOX_ADDRESS, symbol: 'BOX', decimals: 18 }
    ];

    const transactions: AddressTransaction[] = [];
    const blockCache: Record<number, number> = {};

    for (const token of tokens) {
      const contract = new Contract(token.address, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);
      
      // Incoming
      const filterIn = contract.filters.Transfer(null, address);
      const logsIn = await fetchLogsInChunks(contract, filterIn, fromBlock, currentBlock);
      
      // Outgoing
      const filterOut = contract.filters.Transfer(address, null);
      const logsOut = await fetchLogsInChunks(contract, filterOut, fromBlock, currentBlock);

      const processLogs = async (logs: any[], type: 'in' | 'out') => {
        for (const log of logs) {
          if ('args' in log) {
            // @ts-ignore
            const value = parseFloat(formatUnits(log.args[2], token.decimals));
            
            let timestamp = blockCache[log.blockNumber];
            if (!timestamp) {
              const block = await retryOperation(() => log.getBlock()) as any;
              if (block) {
                timestamp = block.timestamp * 1000;
                blockCache[log.blockNumber] = timestamp;
              } else {
                timestamp = Date.now();
              }
            }

            transactions.push({
              hash: log.transactionHash,
              from: log.args[0],
              to: log.args[1],
              value,
              symbol: token.symbol,
              timestamp,
              blockNumber: log.blockNumber,
              type
            });
          }
        }
      };

      // Process logs sequentially
      await processLogs(logsIn, 'in');
      await processLogs(logsOut, 'out');
    }

    return {
      portfolio,
      transactions: transactions.sort((a, b) => b.timestamp - a.timestamp)
    };

  } catch (error) {
    console.error("Failed to fetch address history:", error);
    return { portfolio: null, transactions: [] };
  }
};

// Helper to find block by timestamp (Binary Search)
const findBlockByTimestamp = async (provider: JsonRpcProvider, targetTimestamp: number, currentBlock: number): Promise<number> => {
    let low = Math.max(0, currentBlock - 100000); // Optimization: Start looking from ~3-4 days ago max
    let high = currentBlock;
    let result = currentBlock;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        try {
            const block = await retryOperation(() => provider.getBlock(mid));
            if (!block) {
                low = mid + 1;
                continue;
            }
            if (block.timestamp >= targetTimestamp) {
                result = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        } catch (e) {
            console.warn(`Failed to fetch block ${mid} for binary search`, e);
            // If fetch fails, try to narrow down blindly or just skip
            low = mid + 1; 
        }
    }
    return result;
};

export const fetchDailySwapStats = async (): Promise<{ 
    todayUsdtToUsdx: number, 
    todayUsdxToUsdt: number, 
    yesterdayUsdtToUsdx: number, 
    yesterdayUsdxToUsdt: number,
    lastUpdatedBlock: number 
}> => {
  try {
    const provider = getProvider();
    const lpContract = new Contract(USDX_USDT_LP_ADDRESS, [
      "function token0() view returns (address)",
      "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
    ], provider);

    const currentBlock = await retryOperation(() => provider.getBlockNumber());
    const currentBlockData = await retryOperation(() => provider.getBlock(currentBlock));
    if (!currentBlockData) throw new Error("Failed to fetch current block");

    const currentTimestamp = currentBlockData.timestamp;

    // Calculate Timestamps (Phnom Penh UTC+7)
    // UTC+7 offset in seconds = 7 * 3600 = 25200
    const offset = 25200;
    const nowLocal = new Date((currentTimestamp + offset) * 1000);
    
    // Today 00:00 Local
    const todayStartLocal = new Date(nowLocal);
    todayStartLocal.setUTCHours(0, 0, 0, 0);
    const todayStartTimestamp = (todayStartLocal.getTime() / 1000) - offset;

    // Yesterday 00:00 Local
    const yesterdayStartTimestamp = todayStartTimestamp - 86400;

    // Find Start Blocks sequentially
    const yesterdayStartBlock = await findBlockByTimestamp(provider, yesterdayStartTimestamp, currentBlock);
    const todayStartBlock = await findBlockByTimestamp(provider, todayStartTimestamp, currentBlock);

    // Determine Token0
    let token0 = "";
    try {
        token0 = await retryOperation(() => lpContract.token0());
    } catch (e) {
        token0 = USDX_ADDRESS.toLowerCase() < USDT_ADDRESS.toLowerCase() ? USDX_ADDRESS : USDT_ADDRESS;
    }
    const isUsdxToken0 = token0.toLowerCase() === USDX_ADDRESS.toLowerCase();

    const filter = lpContract.filters.Swap();
    
    // Fetch logs from Yesterday Start to Current Block
    const logs = await fetchLogsInChunks(lpContract, filter, yesterdayStartBlock, currentBlock);

    let todayUsdtToUsdx = 0;
    let todayUsdxToUsdt = 0;
    let yesterdayUsdtToUsdx = 0;
    let yesterdayUsdxToUsdt = 0;

    for (const log of logs) {
        if ('args' in log) {
            const isToday = log.blockNumber >= todayStartBlock;
            
            // @ts-ignore
            const amount0In = BigInt(log.args[1]);
            // @ts-ignore
            const amount1In = BigInt(log.args[2]);
            // @ts-ignore
            const amount0Out = BigInt(log.args[3]);
            // @ts-ignore
            const amount1Out = BigInt(log.args[4]);

            let usdtVal = 0;
            let usdxVal = 0;
            let direction: 'usdtToUsdx' | 'usdxToUsdt' | null = null;

            if (isUsdxToken0) {
                // T0: USDX (18), T1: USDT (6)
                // USDT -> USDX: Input USDT (amt1In)
                if (amount1In > 0n && amount0Out > 0n) {
                    usdtVal = parseFloat(formatUnits(amount1In, 6));
                    direction = 'usdtToUsdx';
                }
                // USDX -> USDT: Input USDX (amt0In)
                if (amount0In > 0n && amount1Out > 0n) {
                    usdxVal = parseFloat(formatUnits(amount0In, 18));
                    direction = 'usdxToUsdt';
                }
            } else {
                // T0: USDT (6), T1: USDX (18)
                // USDT -> USDX: Input USDT (amt0In)
                if (amount0In > 0n && amount1Out > 0n) {
                    usdtVal = parseFloat(formatUnits(amount0In, 6));
                    direction = 'usdtToUsdx';
                }
                // USDX -> USDT: Input USDX (amt1In)
                if (amount1In > 0n && amount0Out > 0n) {
                    usdxVal = parseFloat(formatUnits(amount1In, 18));
                    direction = 'usdxToUsdt';
                }
            }

            if (direction === 'usdtToUsdx') {
                if (isToday) todayUsdtToUsdx += usdtVal;
                else yesterdayUsdtToUsdx += usdtVal;
            } else if (direction === 'usdxToUsdt') {
                if (isToday) todayUsdxToUsdt += usdxVal;
                else yesterdayUsdxToUsdt += usdxVal;
            }
        }
    }

    return {
        todayUsdtToUsdx,
        todayUsdxToUsdt,
        yesterdayUsdtToUsdx,
        yesterdayUsdxToUsdt,
        lastUpdatedBlock: currentBlock
    };

  } catch (e) {
      console.error("Error fetching daily swap stats", e);
      return { 
          todayUsdtToUsdx: 0, 
          todayUsdxToUsdt: 0, 
          yesterdayUsdtToUsdx: 0, 
          yesterdayUsdxToUsdt: 0, 
          lastUpdatedBlock: 0 
      };
  }
};