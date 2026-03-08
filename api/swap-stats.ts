// api/swap-stats.ts
// Vercel Serverless Function - runs on Node.js on the server side (no CORS, no rate limit issues)
// Cached by Vercel Edge: s-maxage=300 means results are shared across all users for 5 minutes

import { JsonRpcProvider, Contract, formatUnits } from "ethers";

type VercelRequest = any;
type VercelResponse = any;


const RPC_URLS = [
    "https://rpc.xone.org",
    "https://rpc-node-1.xone.org",
    "https://rpc-node-2.xone.org",
    "https://rpc-node-3.xone.org",
    "https://rpc-node-4.xone.org",
];

const USDT_ADDRESS = "0xb575796D293f37F112f3694b8ff48D711FE67EC7";
const USDX_ADDRESS = "0x1470855EE884FA849cdA43f4C1Ef031DFd8ECb72";
const FLASH_SWAP = "0x65B770A10E6e0f4754E61cA665171214949539F4";

const TRANSFER_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"];

const getProvider = () => {
    for (const url of RPC_URLS) {
        try { return new JsonRpcProvider(url, undefined, { staticNetwork: true, batchMaxCount: 1 }); }
        catch { continue; }
    }
    return new JsonRpcProvider(RPC_URLS[0]);
};

const fetchLogsInChunks = async (contract: Contract, filter: any, start: number, end: number) => {
    const all: any[] = [];
    let curr = start;
    let chunkSize = 2000;

    while (curr <= end) {
        const next = Math.min(curr + chunkSize - 1, end);
        try {
            const logs = await contract.queryFilter(filter, curr, next);
            all.push(...logs);
            curr = next + 1;
            // Small server-side delay to be polite to the RPC
            await new Promise(r => setTimeout(r, 200));
        } catch (e: any) {
            chunkSize = Math.max(500, Math.floor(chunkSize / 2));
            if (chunkSize < 500) { throw new Error("RPC failed repeatedly"); }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return all;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.status(200).end();
    }

    try {
        const provider = getProvider();
        const currentBlock = await provider.getBlockNumber();
        const blockData = await provider.getBlock(currentBlock);

        if (!blockData) throw new Error("Failed to get block data");

        const UTC7_OFFSET_SEC = 7 * 3600;
        const nowUtc7Ms = (blockData.timestamp + UTC7_OFFSET_SEC) * 1000;
        const todayStartUtcSec = Math.floor(new Date(nowUtc7Ms).setUTCHours(0, 0, 0, 0) / 1000) - UTC7_OFFSET_SEC;
        const yesterdayStartUtcSec = todayStartUtcSec - 86400;

        // Instead of average block time estimation to find the start block, 
        // we fetch a very safe fixed range that absolutely covers 48 hours.
        // Even at an extremely fast 1 sec/block, 48 hours = 172,800 blocks. 
        // 175,000 guarantees we capture the entire "yesterday".
        const SAFE_BLOCKS_48H = 175000;
        const fromBlock = Math.max(0, currentBlock - SAFE_BLOCKS_48H);

        const usdtContract = new Contract(USDT_ADDRESS, TRANSFER_ABI, provider);
        const usdxContract = new Contract(USDX_ADDRESS, TRANSFER_ABI, provider);

        const usdtFilter = usdtContract.filters.Transfer(null, FLASH_SWAP);
        const usdxFilter = usdxContract.filters.Transfer(null, FLASH_SWAP);

        const [usdtLogs, usdxLogs] = await Promise.all([
            fetchLogsInChunks(usdtContract, usdtFilter, fromBlock, currentBlock),
            fetchLogsInChunks(usdxContract, usdxFilter, fromBlock, currentBlock),
        ]);

        let todayUsdtToUsdx = 0;
        let todayUsdxToUsdt = 0;
        let yesterdayUsdtToUsdx = 0;
        let yesterdayUsdxToUsdt = 0;

        // Collect all unique block numbers from logs
        const uniqueBlocks = Array.from(new Set([
            ...usdtLogs.map(l => l.blockNumber),
            ...usdxLogs.map(l => l.blockNumber)
        ]));

        // Fetch EXACT block timestamps from the RPC
        const blockTimestamps: Record<number, number> = {};
        const chunkSize = 15;
        for (let i = 0; i < uniqueBlocks.length; i += chunkSize) {
            const batch = uniqueBlocks.slice(i, i + chunkSize);
            await Promise.all(batch.map(async (b) => {
                try {
                    const block = await provider.getBlock(b);
                    if (block) {
                        blockTimestamps[b] = block.timestamp;
                    }
                } catch (e) {
                    console.warn(`Failed to fetch exact block: ${b}`);
                }
            }));
            // Polite delay
            await new Promise(r => setTimeout(r, 100));
        }

        // Fallback estimator if RPC fails for a specific block
        const avgBlockTime = 1.3;
        const exactTs = (blockNum: number) => {
            if (blockTimestamps[blockNum]) return blockTimestamps[blockNum];
            return blockData.timestamp - Math.floor((currentBlock - blockNum) * avgBlockTime);
        };

        for (const log of usdtLogs) {
            if (!log.args) continue;
            const val = parseFloat(formatUnits(log.args[2], 6));
            const ts = exactTs(log.blockNumber);
            if (ts >= todayStartUtcSec) todayUsdtToUsdx += val;
            else if (ts >= yesterdayStartUtcSec) yesterdayUsdtToUsdx += val;
        }

        for (const log of usdxLogs) {
            if (!log.args) continue;
            const val = parseFloat(formatUnits(log.args[2], 18));
            const ts = exactTs(log.blockNumber);
            if (ts >= todayStartUtcSec) todayUsdxToUsdt += val;
            else if (ts >= yesterdayStartUtcSec) yesterdayUsdxToUsdt += val;
        }

        // Cache-Control: s-maxage=300 means Vercel Edge caches this for 5 minutes
        // All users share this single cached response
        res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");

        return res.status(200).json({
            todayUsdtToUsdx,
            todayUsdxToUsdt,
            yesterdayUsdtToUsdx,
            yesterdayUsdxToUsdt,
            lastUpdatedBlock: currentBlock,
            generatedAt: Date.now()
        });

    } catch (e: any) {
        console.error("[swap-stats] Error:", e.message);
        return res.status(500).json({ error: e.message || "Internal server error" });
    }
}
