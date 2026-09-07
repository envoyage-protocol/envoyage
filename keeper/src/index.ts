/**
 * Reference keeper for Envoyage.
 *
 * The interesting property of this bot is how little it can do. It holds a private
 * key with a mandate over someone else's position, and the only state-changing call
 * it can make is `compound(mandateId, minFee)` — two numbers, no destination, no
 * action list, no route. Read the whole file: there is no code path that could
 * redirect funds, because there is no parameter in which to express one.
 *
 * That is the difference from every keeper that holds `approve(keeper, tokenId)`.
 * Such a bot could assemble DECREASE_LIQUIDITY + TAKE_PAIR(…, its own wallet) at
 * any time, and nothing on chain would stop it. Its restraint would be a property of
 * its source code — which its users cannot see, and which an attacker who steals the
 * key does not inherit.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  toFunctionSelector,
  formatUnits,
  type Address,
  type Hex
} from "viem";
import {privateKeyToAccount, type PrivateKeyAccount} from "viem/accounts";
import {sepolia} from "viem/chains";
import {fetchWork, cooldownRemaining, type Work} from "./graph.js";
import {
  MANDATES,
  CAN_COMPOUND,
  COMPOUND,
  REFUSALS,
  EXECUTION_ERRORS,
  SET_TEXT,
  NODE_FOR,
  KEEPER_KEY
} from "./abi.js";

const ENVOYAGE = (process.env.ENVOYAGE_ADDRESS ??
  "0x8466e82E02edF3F00c0387D5C3E66d407dc7259C") as Address;
const POLL_MS = Number(process.env.POLL_MS ?? 30_000);

/// Minimum harvested fee, summed across both tokens, below which the call is not
/// worth its gas. Passed to the contract as `minFee`, so the CONTRACT enforces it
/// and the transaction reverts rather than executing a pointless compound. A bot
/// that only checked this locally would still race itself between check and send.
const MIN_FEE = BigInt(process.env.MIN_FEE ?? "1000000000000");

/// Two operators, not two endpoints from one provider. Three keys from a single
/// provider share one failure domain: when it rate-limits, every one of them
/// rate-limits together and the fallback never actually fails over.
const RPCS = (process.env.SEPOLIA_RPC_URL
  ? [process.env.SEPOLIA_RPC_URL]
  : []
).concat(["https://ethereum-sepolia-rpc.publicnode.com", "https://1rpc.io/sepolia"]);

/// Optional. Set both and the keeper reports each run into its own ENS record.
const ENVOYAGE_NAMES = process.env.ENVOYAGE_NAMES as Address | undefined;
const ENS_RESOLVER = process.env.ENS_RESOLVER as Address | undefined;

const OK: Hex = "0x00000000";
const REASON: Record<string, string> = Object.fromEntries(
  [...REFUSALS, ...EXECUTION_ERRORS].map((sig) => [toFunctionSelector(sig), sig.replace("()", "")])
);

/// viem nests the revert data several layers down and its top line is a generic
/// sentence, so the selector is pulled out of the whole error text and named. Without
/// this the most common healthy outcome — FeeBelowMinimum — is indistinguishable
/// from a real failure.
function explain(e: unknown): string {
  const text = e instanceof Error ? `${e.message}` : String(e);
  const hit = text.match(/0x[0-9a-fA-F]{8}\b/g)?.find((s) => REASON[s.toLowerCase()]);
  if (hit) return REASON[hit.toLowerCase()];
  return text.split("\n")[0];
}

const pub = createPublicClient({chain: sepolia, transport: fallback(RPCS.map((u) => http(u)))});

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}

async function tick(account: PrivateKeyAccount, wallet: ReturnType<typeof createWalletClient>) {
  // The Graph decides what this bot works on. The subgraph filters to mandates that
  // name this keeper, are ACTIVE, permit compounding and have not expired, and orders
  // them by least-recently-served — none of which a log scan can express, because a
  // log scan only knows that a grant happened, never what became of it.
  const work: Work[] = await fetchWork(account.address);
  if (work.length === 0) {
    log("subgraph reports no actionable mandates for", account.address);
    return;
  }
  log(`subgraph: ${work.length} actionable mandate(s)`);

  const nowSec = Math.floor(Date.now() / 1000);
  for (const w of work) {
    const id = w.mandateId;

    const wait = cooldownRemaining(w, nowSec);
    if (wait > 0n) {
      log(`mandate ${id}: skip — ${wait}s of cooldown left (from indexed history)`);
      continue;
    }
    const reason = (await pub.readContract({
      address: ENVOYAGE,
      abi: [CAN_COMPOUND],
      functionName: "canCompound",
      args: [id]
    })) as Hex;

    if (reason !== OK) {
      // Asked before spending gas. This is exactly why canCompound exists: a revert
      // discards logs, so the contract cannot emit an event explaining a refusal.
      log(`mandate ${id}: skip — ${REASON[reason] ?? `unknown ${reason}`}`);
      continue;
    }

    const m = await pub.readContract({
      address: ENVOYAGE,
      abi: [MANDATES],
      functionName: "mandates",
      args: [id]
    });

    try {
      // Simulate first. A failed simulation costs nothing; a failed broadcast costs
      // gas and leaves a red transaction on the explorer during a demo.
      // The ACCOUNT OBJECT, not its address. Passing a bare address makes viem
      // tag the request as a json-rpc account, and writeContract then calls
      // eth_sendTransaction — asking a public RPC to sign with a key it does not
      // have. It fails with "Missing or invalid parameters", which names neither
      // the cause nor the contract, and the simulation passes first so the bug
      // looks like an RPC problem. With the account object viem signs locally and
      // sends eth_sendRawTransaction.
      const {request} = await pub.simulateContract({
        address: ENVOYAGE,
        abi: [COMPOUND],
        functionName: "compound",
        args: [id, MIN_FEE],
        account
      });

      const hash = await wallet.writeContract(request);
      log(`mandate ${id}: compound sent ${hash}`);
      const rc = await pub.waitForTransactionReceipt({hash});
      log(
        `mandate ${id}: ${rc.status} in block ${rc.blockNumber}, gas ${rc.gasUsed}` +
          ` (fee cap ${(Number(m[3]) / 100).toFixed(2)}% to ${m[4]})`
      );

      if (rc.status === "success") await reportToEns(account, wallet, w.positionId, rc.blockNumber);
    } catch (e) {
      // Most often FeeBelowMinimum: fees have not accrued past MIN_FEE yet. That is
      // the normal state of a healthy keeper, not an error, so it must not be fatal.
      log(`mandate ${id}: not executed — ${explain(e)}`);
    }
  }
}

/// Writes the run into the mandate's ENS record.
///
/// @dev This is the keeper telling the world what it did, in a record the OWNER can
///      read and the keeper cannot forge beyond one field. It holds ROLE_SET_TEXT on
///      `envoyage:lastRun` and nothing else, so the same call aimed at
///      `envoyage:maxFeeBps` reverts EACUnauthorizedAccountRoles. Reporting and
///      authority are separated here exactly as they are in the contract.
///
///      Failure is logged, never fatal: a compound that landed must not be reported
///      as failed because a follow-up record write did not.
async function reportToEns(
  account: PrivateKeyAccount,
  wallet: ReturnType<typeof createWalletClient>,
  positionId: bigint,
  block: bigint
) {
  if (!ENVOYAGE_NAMES || !ENS_RESOLVER) return;
  try {
    const node = (await pub.readContract({
      address: ENVOYAGE_NAMES,
      abi: [NODE_FOR],
      functionName: "nodeFor",
      args: [positionId]
    })) as Hex;

    const {request} = await pub.simulateContract({
      address: ENS_RESOLVER,
      abi: [SET_TEXT],
      functionName: "setText",
      args: [node, KEEPER_KEY, block.toString()],
      account
    });
    const hash = await wallet.writeContract(request);
    await pub.waitForTransactionReceipt({hash});
    log(`  reported block ${block} to ${KEEPER_KEY}`);
  } catch (e) {
    log(`  ENS report failed (compound still succeeded): ${explain(e)}`);
  }
}

async function main() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) throw new Error("KEEPER_PRIVATE_KEY is required");

  const account = privateKeyToAccount(pk as Hex);
  const wallet = createWalletClient({account, chain: sepolia, transport: http(RPCS[0])});

  const bal = await pub.getBalance({address: account.address});
  log(`keeper ${account.address}, balance ${formatUnits(bal, 18)} ETH`);
  log(`envoyage ${ENVOYAGE}, minFee ${MIN_FEE}`);
  log(ENVOYAGE_NAMES && ENS_RESOLVER ? `ens reporting on, key ${KEEPER_KEY}` : "ens reporting off");

  const once = process.argv.includes("--once");
  for (;;) {
    try {
      await tick(account, wallet);
    } catch (e) {
      // A single bad poll must never kill the loop. An RPC on a load-balanced pool
      // can answer from a node one block behind, and that looks like an error.
      log("tick failed:", e instanceof Error ? e.message.split("\n")[0] : e);
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
