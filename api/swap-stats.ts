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
            chunkSize = Math.max(50, Math.floor(chunkSize / 2));
            if (chunkSize < 50) { curr += 50; chunkSize = 200; }
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

        // Day boundaries in UTC+8 (Beijing)
        const UTC8 = 8 * 3600;
        const nowUtc8Ms = (blockData.timestamp + UTC8) * 1000;
        const todayStartMs = new Date(nowUtc8Ms).setUTCHours(0, 0, 0, 0);
        const todayStartUtcSec = todayStartMs / 1000 - UTC8;
        const yesterdayStartUtcSec = todayStartUtcSec - 86400;

        // Estimate block numbers (~3s/block on XONE)
        const avgBlockTime = 3;
        const todayStartBlock = Math.max(0,
            currentBlock - Math.floor((blockData.timestamp - todayStartUtcSec) / avgBlockTime)
        );
        const yesterdayStartBlock = Math.max(0,
            currentBlock - Math.floor((blockData.timestamp - yesterdayStartUtcSec) / avgBlockTime)
        );

        // Fetch from ~yesterday start
        const fromBlock = Math.max(0, yesterdayStartBlock - 500); // small buffer

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

        for (const log of usdtLogs) {
            if (!log.args) continue;
            const val = parseFloat(formatUnits(log.args[2], 6));
            if (log.blockNumber >= todayStartBlock) todayUsdtToUsdx += val;
            else if (log.blockNumber >= yesterdayStartBlock) yesterdayUsdtToUsdx += val;
        }

        for (const log of usdxLogs) {
            if (!log.args) continue;
            const val = parseFloat(formatUnits(log.args[2], 18));
            if (log.blockNumber >= todayStartBlock) todayUsdxToUsdt += val;
            else if (log.blockNumber >= yesterdayStartBlock) yesterdayUsdxToUsdt += val;
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
            generatedAt: Date.now(),
            todayStartBlock,
            yesterdayStartBlock,
        });

    } catch (e: any) {
        console.error("[swap-stats] Error:", e.message);
        return res.status(500).json({ error: e.message || "Internal server error" });
    }
}
