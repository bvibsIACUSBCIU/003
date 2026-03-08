import { JsonRpcProvider } from "ethers";

async function main() {
    const provider = new JsonRpcProvider("https://rpc.xone.org");
    const end = await provider.getBlockNumber();
    const start = end - 10000;
    console.log(`Querying ${start} to ${end}...`);
    try {
        const logs = await provider.getLogs({
            address: "0x65B770A10E6e0f4754E61cA665171214949539F4",
            fromBlock: start,
            toBlock: end
        });
        console.log(`Found ${logs.length} logs emitted by FLASH_SWAP.`);
        if (logs.length > 0) {
            console.log("Topics of first few logs:");
            for (let i = 0; i < Math.min(5, logs.length); i++) {
                console.log(logs[i].topics);
            }
        }
    } catch (e: any) {
        console.error(e.message);
    }
}
main();
