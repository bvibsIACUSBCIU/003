import { JsonRpcProvider, Contract } from "ethers";
import { RPC_URL, USDX_USDT_LP_ADDRESS } from "./constants.js";

const provider = new JsonRpcProvider(RPC_URL);

async function test() {
    try {
        const currentBlock = await provider.getBlockNumber();
        console.log("Current Block:", currentBlock);

        const lpContract = new Contract(USDX_USDT_LP_ADDRESS, [
            "function token0() view returns (address)",
            "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
        ], provider);

        try {
            const t0 = await lpContract.token0();
            console.log("Token0:", t0);
        } catch (e) {
            console.log("Failed to call token0()");
        }

        const filter = lpContract.filters.Swap();
        // Look back 50000 blocks to be sure
        const fromBlock = currentBlock - 50000;
        console.log("Fetching logs from", fromBlock, "to", currentBlock);

        const logs = await lpContract.queryFilter(filter, fromBlock, currentBlock);
        console.log("Total logs found:", logs.length);

        if (logs.length > 0) {
            console.log("First log sample (truncated args):", {
                transactionHash: logs[0].transactionHash,
                blockNumber: logs[0].blockNumber,
                // @ts-ignore
                args: logs[0].args ? Array.from(logs[0].args).map(a => typeof a === 'bigint' ? a.toString() : a) : null
            });
        }

    } catch (e) {
        console.error("Error in test script:", e);
    }
}

test();
