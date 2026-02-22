import { JsonRpcProvider, Contract, formatUnits, formatEther } from "ethers";
import { 
  RPC_URL, 
  TARGET_CONTRACT_ADDRESS, 
  USDT_ADDRESS, 
  USDX_ADDRESS,
  B3_ADDRESS,
  B3_LP_ADDRESS,
  USDX_USDT_LP_ADDRESS,
  TOKEN_PRICE_USD
} from "../constants";
import { ContractStats, VipAccountsData, MonitoredWallet, WalletPortfolio, LargeTransaction } from "../types";

// Standard ERC20 ABI for balanceOf
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export const fetchRealChainData = async (
  monitoredWallets: MonitoredWallet[] = []
): Promise<{stats: Partial<ContractStats>, vipData: VipAccountsData}> => {
  try {
    const provider = new JsonRpcProvider(RPC_URL);

    // 1. Fetch Native Token (XOC) Balance of Target Contract
    const balanceWei = await provider.getBalance(TARGET_CONTRACT_ADDRESS);
    const balanceXoc = parseFloat(formatEther(balanceWei));

    // Helper to fetch token data
    const fetchTokenBalance = async (tokenAddress: string, walletAddress: string) => {
      const contract = new Contract(tokenAddress, ERC20_ABI, provider);
      try {
        const wei = await contract.balanceOf(walletAddress);
        let decimals = 18;
        try { decimals = await contract.decimals(); } catch (e) {
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
    const balanceB3 = await fetchTokenBalance(B3_ADDRESS, TARGET_CONTRACT_ADDRESS);

    // 3. Fetch LP Contract Balances (B3/USDX)
    const lpBalanceB3 = await fetchTokenBalance(B3_ADDRESS, B3_LP_ADDRESS);
    const lpBalanceUsdx = await fetchTokenBalance(USDX_ADDRESS, B3_LP_ADDRESS);

    // 4. Fetch LP 2 Contract Balances (USDX/USDT)
    const lp2BalanceUsdx = await fetchTokenBalance(USDX_ADDRESS, USDX_USDT_LP_ADDRESS);
    const lp2BalanceUsdt = await fetchTokenBalance(USDT_ADDRESS, USDX_USDT_LP_ADDRESS);

    // 5. Calculate Real-Time Price & Peg
    let b3Price = 0;
    if (lpBalanceB3 > 0 && lpBalanceUsdx > 0) {
      b3Price = lpBalanceUsdx / lpBalanceB3;
    }

    let stablePeg = 1;
    if (lp2BalanceUsdx > 0 && lp2BalanceUsdt > 0) {
      stablePeg = lp2BalanceUsdt / lp2BalanceUsdx; // Price of 1 USDX in USDT
    }

    const totalUsd = (balanceXoc * TOKEN_PRICE_USD) + balanceUsdt + balanceUsdx + (balanceB3 * b3Price);

    // Hardcoded Mock Volume (In production, query from Indexer/Graph)
    const volume24h = 1250000;
    // Calculate 0.3% Fees
    const fees24h = volume24h * 0.003; 

    // 6. Fetch Portfolios for Monitored Wallets (Dynamic List)
    const portfolios: WalletPortfolio[] = await Promise.all(monitoredWallets.map(async (wallet) => {
      try {
        // Native XOC
        const xocWei = await provider.getBalance(wallet.address);
        const balXoc = parseFloat(formatEther(xocWei));
        
        // Tokens
        const balUsdt = await fetchTokenBalance(USDT_ADDRESS, wallet.address);
        const balUsdx = await fetchTokenBalance(USDX_ADDRESS, wallet.address);
        const balB3 = await fetchTokenBalance(B3_ADDRESS, wallet.address);
        
        // Est Total Value (Simple approx)
        const totalVal = (balXoc * TOKEN_PRICE_USD) + balUsdt + balUsdx + (balB3 * b3Price);

        return {
          ...wallet,
          balanceXoc: balXoc,
          balanceUsdt: balUsdt,
          balanceUsdx: balUsdx,
          balanceB3: balB3,
          totalValueUsd: totalVal
        };
      } catch (e) {
        // Return zeros if invalid address or error
        return {
          ...wallet,
          balanceXoc: 0,
          balanceUsdt: 0,
          balanceUsdx: 0,
          balanceB3: 0,
          totalValueUsd: 0
        };
      }
    }));

    // Sort portfolios by total value desc
    portfolios.sort((a, b) => b.totalValueUsd - a.totalValueUsd);

    return {
      stats: {
        currentBalance: balanceXoc,
        balanceUsdt,
        balanceUsdx,
        balanceB3,
        lpBalanceB3,
        lpBalanceUsdx,
        b3Price,
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
    const provider = new JsonRpcProvider(RPC_URL);
    
    // Contracts
    const usdxContract = new Contract(USDX_ADDRESS, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);
    const usdtContract = new Contract(USDT_ADDRESS, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    // Look back ~24 hours (assuming 3s block time -> ~28800 blocks)
    const fromBlock = Math.max(0, currentBlock - 28800); 

    // Helper to fetch logs in chunks
    const fetchLogsInChunks = async (contract: Contract, filter: any, startBlock: number, endBlock: number) => {
      const logs = [];
      const chunkSize = 5000;
      for (let i = startBlock; i <= endBlock; i += chunkSize) {
        const toBlock = Math.min(i + chunkSize - 1, endBlock);
        try {
          const chunkLogs = await contract.queryFilter(filter, i, toBlock);
          logs.push(...chunkLogs);
        } catch (e) {
          console.error(`Failed to fetch logs from ${i} to ${toBlock}`, e);
        }
      }
      return logs;
    };

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
              const block = await log.getBlock();
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

    await Promise.all([
      processLogs(logsUsdx, 'USDX', 18),
      processLogs(logsUsdt, 'USDT', 6)
    ]);

    // Sort by timestamp desc
    return transactions.sort((a, b) => b.timestamp - a.timestamp);

  } catch (error) {
    console.error("Failed to fetch large transactions:", error);
    return [];
  }
};