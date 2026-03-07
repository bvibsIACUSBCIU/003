// api/chain-data.ts
// Vercel Serverless Function - fetches chain stats server-side
// Cached: s-maxage=60 (shared 1-minute cache for all users)

import { JsonRpcProvider, Contract, formatUnits, formatEther } from "ethers";

type VercelRequest = any;
type VercelResponse = any;


const RPC_URLS = [
    "https://rpc.xone.org",
    "https://rpc-node-1.xone.org",
    "https://rpc-node-2.xone.org",
    "https://rpc-node-3.xone.org",
    "https://rpc-node-4.xone.org"
];

const TARGET = "0x65B770A10E6e0f4754E61cA665171214949539F4";
const USDT_ADDR = "0xb575796D293f37F112f3694b8ff48D711FE67EC7";
const USDX_ADDR = "0x1470855EE884FA849cdA43f4C1Ef031DFd8ECb72";
const BOX_ADDR = "0x2d3B35c7D701A6E50c6b354Ad649a796E3841A46";
const BOX_LP = "0x9523DC9E45Dd7345b333A4014Be629b5d826B1e6";
const FLASH_LP = "0x65B770A10E6e0f4754E61cA665171214949539F4";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

const getProvider = () => new JsonRpcProvider(RPC_URLS[0], undefined, {
    staticNetwork: true, batchMaxCount: 1,
});

const getBalance = async (provider: JsonRpcProvider, token: string, wallet: string, decimals: number) => {
    try {
        const c = new Contract(token, ERC20_ABI, provider);
        const wei = await c.balanceOf(wallet);
        return parseFloat(formatUnits(wei, decimals));
    } catch { return 0; }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.status(200).end();
    }

    try {
        const provider = getProvider();

        const [
            xocWei,
            balanceUsdt, balanceUsdx, balanceBox,
            lpBalanceBox, lpBalanceUsdx,
            lp2BalanceUsdx, lp2BalanceUsdt
        ] = await Promise.all([
            provider.getBalance(TARGET),
            getBalance(provider, USDT_ADDR, TARGET, 6),
            getBalance(provider, USDX_ADDR, TARGET, 18),
            getBalance(provider, BOX_ADDR, TARGET, 18),
            getBalance(provider, BOX_ADDR, BOX_LP, 18),
            getBalance(provider, USDX_ADDR, BOX_LP, 18),
            getBalance(provider, USDX_ADDR, FLASH_LP, 18),
            getBalance(provider, USDT_ADDR, FLASH_LP, 6),
        ]);

        const balanceXoc = parseFloat(formatEther(xocWei));
        const boxPrice = lpBalanceBox > 0 && lpBalanceUsdx > 0
            ? lpBalanceUsdx / lpBalanceBox : 0;
        const totalUsd = balanceUsdt + balanceUsdx + (balanceBox * boxPrice); // XOC excluded as separate asset

        res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");

        return res.status(200).json({
            currentBalance: balanceXoc,
            balanceUsdt,
            balanceUsdx,
            balanceBox,
            lpBalanceBox,
            lpBalanceUsdx,
            boxPrice,
            lp2BalanceUsdx,
            lp2BalanceUsdt,
            stablePeg: 1,
            balanceUsd: totalUsd,
            generatedAt: Date.now(),
        });

    } catch (e: any) {
        console.error("[chain-data] Error:", e.message);
        return res.status(500).json({ error: e.message });
    }
}
