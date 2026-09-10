/**
 * Fee supply for the demo pool.
 *
 * A Uniswap v4 position earns fees only when the pool trades. Nothing trades a
 * testnet demo pool on its own, so a freshly minted position would sit at zero
 * fees and the keeper would refuse it forever with FeeBelowMinimum — the demo's
 * "watch it happen" beat would never happen. This loop is the market: one
 * round-trip swap through DemoSwapper every CADENCE_MS, from the deployer key,
 * for as long as it is left running. Judged deliberately over a helper contract
 * so the on-chain surface stays unchanged this close to submission.
 *
 * It pauses, and says so, when the deployer balance falls below a floor.
 */
import {createPublicClient, createWalletClient, http, fallback, formatUnits, parseAbiItem, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {sepolia} from "viem/chains";

const SWAPPER = (process.env.DEMO_SWAPPER ?? "0x8A61cad8909BacC9a764f1b21451Afb3c6501D7A") as Address;
const TOKEN0 = (process.env.DEMO_TOKEN0 ?? "0x1dC7e196Ff124C79191154C635df75a315e00985") as Address;
const TOKEN1 = (process.env.DEMO_TOKEN1 ?? "0x7D5Dc05acea592601e6888ccB04D625CDc6c13DC") as Address;
const FEE = 10_000;
const TICK_SPACING = 200;

const CADENCE_MS = Number(process.env.SWAP_CADENCE_MS ?? 120_000);
const SWAP_SIZE = BigInt(process.env.SWAP_SIZE_WEI ?? "1000000000000000000"); // 1e18, exact-in
const BALANCE_FLOOR = BigInt(process.env.SWAP_BALANCE_FLOOR_WEI ?? "10000000000000000"); // 0.01 ETH

// TickMath bounds from v4-core; the limit only needs to be past any reachable price.
const MIN_SQRT_PRICE = 4295128739n + 1n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n - 1n;

const RPCS = (process.env.SEPOLIA_RPC_URL ? [process.env.SEPOLIA_RPC_URL] : []).concat([
  "https://ethereum-sepolia-rpc.publicnode.com"
]);

const SWAP = parseAbiItem(
  "function swap((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params) returns (int256)"
);

const pub = createPublicClient({chain: sepolia, transport: fallback(RPCS.map((u) => http(u)))});
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[swap-loop]", ...a);

export type SwapSender = (zeroForOne: boolean) => Promise<Hex>;

/// One tick: a round trip, so price ends roughly where it started and the
/// position stays in range. Exported so the cadence logic is testable with the
/// send mocked out.
export async function tick(send: SwapSender, balance: bigint): Promise<"sent" | "skipped" | "failed"> {
  if (balance < BALANCE_FLOOR) {
    log(`balance ${formatUnits(balance, 18)} ETH below floor ${formatUnits(BALANCE_FLOOR, 18)} — skipping`);
    return "skipped";
  }
  try {
    const a = await send(true);
    const b = await send(false);
    log(`round trip ${a} / ${b}`);
    return "sent";
  } catch (e) {
    // One failed tick is not fatal: an RPC hiccup must not stop the market.
    log("send failed:", e instanceof Error ? e.message.split("\n")[0] : e);
    return "failed";
  }
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY is required");
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({account, chain: sepolia, transport: http(RPCS[0])});

  const key = {currency0: TOKEN0, currency1: TOKEN1, fee: FEE, tickSpacing: TICK_SPACING, hooks: "0x0000000000000000000000000000000000000000" as Address};

  const send: SwapSender = async (zeroForOne) => {
    const {request} = await pub.simulateContract({
      account,
      address: SWAPPER,
      abi: [SWAP],
      functionName: "swap",
      args: [key, {zeroForOne, amountSpecified: -SWAP_SIZE, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE : MAX_SQRT_PRICE}]
    });
    const hash = await wallet.writeContract(request);
    await pub.waitForTransactionReceipt({hash});
    return hash;
  };

  log(`deployer ${account.address}, cadence ${CADENCE_MS / 1000}s, size ${formatUnits(SWAP_SIZE, 18)} per leg`);
  const once = process.argv.includes("--once");
  for (;;) {
    const balance = await pub.getBalance({address: account.address}).catch(() => 0n);
    await tick(send, balance);
    if (once) return;
    await new Promise((r) => setTimeout(r, CADENCE_MS));
  }
}

if (process.argv[1]?.endsWith("swap-loop.ts") || process.argv[1]?.endsWith("swap-loop.js")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
