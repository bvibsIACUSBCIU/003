// api/large-txs.ts
// Vercel Serverless Function - fetches large swap transactions
// Cached: s-maxage=300 (5-minute shared cache)

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
const THRESHOLD = 1000; // Only show swaps > 1000 USD

const TRANSFER_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"];

const getProvider = () => new JsonRpcProvider(RPC_URLS[0], undefined, {
    staticNetwork: true, batchMaxCount: 1,
});

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
            await new Promise(r => setTimeout(r, 200));
        } catch {
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
        const fromBlock = Math.max(0, currentBlock - 34560); // ~24h

        const usdtContract = new Contract(USDT_ADDRESS, TRANSFER_ABI, provider);
        const usdxContract = new Contract(USDX_ADDRESS, TRANSFER_ABI, provider);

        const [usdtLogs, usdxLogs] = await Promise.all([
            fetchLogsInChunks(usdtContract, usdtContract.filters.Transfer(null, FLASH_SWAP), fromBlock, currentBlock),
            fetchLogsInChunks(usdxContract, usdxContract.filters.Transfer(null, FLASH_SWAP), fromBlock, currentBlock),
        ]);

        const txs: any[] = [];
        const now = Date.now();

        for (const log of usdtLogs) {
            if (!log.args) continue;
            const value = parseFloat(formatUnits(log.args[2], 6));
            if (value >= THRESHOLD) {
                txs.push({
                    hash: log.transactionHash,
                    from: log.args[0],
                    to: FLASH_SWAP,
                    value,
                    symbol: "USDT",
                    timestamp: now - ((currentBlock - log.blockNumber) * 3000),
                    blockNumber: log.blockNumber,
                });
            }
        }

        for (const log of usdxLogs) {
            if (!log.args) continue;
            const value = parseFloat(formatUnits(log.args[2], 18));
            if (value >= THRESHOLD) {
                txs.push({
                    hash: log.transactionHash,
                    from: log.args[0],
                    to: FLASH_SWAP,
                    value,
                    symbol: "USDX",
                    timestamp: now - ((currentBlock - log.blockNumber) * 3000),
                    blockNumber: log.blockNumber,
                });
            }
        }

        txs.sort((a, b) => b.blockNumber - a.blockNumber);

        res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");

        return res.status(200).json({ transactions: txs, generatedAt: Date.now() });

    } catch (e: any) {
        console.error("[large-txs] Error:", e.message);
        return res.status(500).json({ error: e.message });
    }
}
