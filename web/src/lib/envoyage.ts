import {
  createPublicClient,
  http,
  fallback,
  parseAbiItem,
  toFunctionSelector,
  keccak256,
  toBytes,
  type Address,
  type Hex
} from "viem";
import {
  CHAIN,
  RPC_URLS,
  ENVOYAGE,
  POSITION_MANAGER,
  DEPLOY_BLOCK,
  ENVOYAGE_NAMES,
  ENS_RESOLVER,
  ENS_REGISTRY
} from "./config";

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: fallback(RPC_URLS.map((u) => http(u)))
});

export {envoyageAbi} from "./envoyage.abi";
import {envoyageAbi} from "./envoyage.abi";

export const resolverAbi = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [{type: "bytes32"}, {type: "string"}],
    outputs: [{type: "string"}]
  }
] as const;

export const namesAbi = [
  {
    type: "function",
    name: "nodeFor",
    stateMutability: "view",
    inputs: [{type: "uint256"}],
    outputs: [{type: "bytes32"}]
  }
] as const;

export const posmAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{type: "uint256"}],
    outputs: [{type: "address"}]
  },
  {
    type: "function",
    name: "getApproved",
    stateMutability: "view",
    inputs: [{type: "uint256"}],
    outputs: [{type: "address"}]
  }
] as const;

export type Mandate = {
  keeper: Address;
  grantor: Address;
  tokenId: bigint;
  maxFeeBps: number;
  feeRecipient: Address;
  expiry: bigint;
  minInterval: bigint;
  lastCall: bigint;
  compoundAllowed: boolean;
};

/// Maps the selector returned by canCompound() to a sentence.
///
/// canCompound exists because a revert discards logs: the contract cannot emit an
/// event explaining a refusal, because the revert that follows would undo it. So the
/// reason comes back from a view function instead, and this is where it is made
/// readable.
///
/// The selectors are DERIVED from the signatures at runtime, never written down. The
/// first draft of this file hard-coded them from memory and four of six were wrong —
/// and wrong in the worst way, since a mismatched selector shows no error, it just
/// silently falls through to "unknown" while the contract is behaving correctly.
const REFUSALS: {sig: string; text: string}[] = [
  {sig: "MandateInactive()", text: "No such mandate, or it has been revoked."},
  {sig: "NotKeeper()", text: "Caller is not this mandate's keeper."},
  {sig: "CompoundNotAllowed()", text: "Compounding is not permitted by this mandate."},
  {sig: "MandateExpired()", text: "The mandate has expired."},
  {sig: "CooldownActive()", text: "Cooldown has not elapsed since the last call."},
  {sig: "OwnerChanged()", text: "The position changed hands; the mandate no longer applies."}
];

export const REFUSAL_REASONS: Record<string, string> = Object.fromEntries([
  ["0x00000000", "Allowed right now."],
  ...REFUSALS.map((r) => [toFunctionSelector(r.sig) as string, r.text])
]);

export async function readMandate(id: bigint): Promise<Mandate> {
  const r = (await publicClient.readContract({
    address: ENVOYAGE,
    abi: envoyageAbi,
    functionName: "mandates",
    args: [id]
  })) as readonly [Address, Address, bigint, number, Address, bigint, bigint, bigint, boolean];

  return {
    keeper: r[0],
    grantor: r[1],
    tokenId: r[2],
    maxFeeBps: r[3],
    feeRecipient: r[4],
    expiry: r[5],
    minInterval: r[6],
    lastCall: r[7],
    compoundAllowed: r[8]
  };
}

export async function readCanCompound(id: bigint): Promise<Hex> {
  return (await publicClient.readContract({
    address: ENVOYAGE,
    abi: envoyageAbi,
    functionName: "canCompound",
    args: [id]
  })) as Hex;
}

export async function readPositionOwner(tokenId: bigint) {
  const [owner, approved] = await Promise.all([
    publicClient.readContract({
      address: POSITION_MANAGER,
      abi: posmAbi,
      functionName: "ownerOf",
      args: [tokenId]
    }),
    publicClient.readContract({
      address: POSITION_MANAGER,
      abi: posmAbi,
      functionName: "getApproved",
      args: [tokenId]
    })
  ]);
  return {owner: owner as Address, approved: approved as Address};
}

export const MANDATE_EXECUTED = parseAbiItem(
  "event MandateExecuted(uint256 indexed id, uint256 fee0Paid, uint256 fee1Paid, uint128 liquidityAdded)"
);

export type Execution = {
  txHash: Hex;
  block: bigint;
  fee0Paid: bigint;
  fee1Paid: bigint;
  liquidityAdded: bigint;
};

export type OperatorReport = {host: string; status: "ok" | "failed"; count: number};

/// Per-operator log query. Returned alongside the union so a caller can SAY what
/// happened instead of collapsing three different situations into one number.
///
/// This exists because of two observed failures on 9 Sept, hours apart:
///   - 1rpc.io answered getLogs with zero logs and HTTP 200 while publicnode had 3.
///   - later, in the browser, publicnode was rate-limited and FAILED, so the only
///     operator that answered was the one returning a false zero — and a union of
///     one wrong answer is that wrong answer.
/// A bare count cannot distinguish "truly none" from "the honest node was down".
/// The report can.
export async function readExecutionsAudit(id: bigint): Promise<{executions: Execution[]; operators: OperatorReport[]}> {
  const results = await Promise.allSettled(
    RPC_URLS.map((url) =>
      createPublicClient({chain: CHAIN, transport: http(url)}).getLogs({
        address: ENVOYAGE,
        event: MANDATE_EXECUTED,
        args: {id},
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest"
      })
    )
  );

  const operators: OperatorReport[] = results.map((r, i) => ({
    host: new URL(RPC_URLS[i]).host,
    status: r.status === "fulfilled" ? "ok" : "failed",
    count: r.status === "fulfilled" ? r.value.length : 0
  }));

  const byTx = new Map<string, Execution>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const l of r.value) {
      byTx.set(l.transactionHash, {
        txHash: l.transactionHash,
        block: l.blockNumber,
        fee0Paid: l.args.fee0Paid ?? 0n,
        fee1Paid: l.args.fee1Paid ?? 0n,
        liquidityAdded: l.args.liquidityAdded ?? 0n
      });
    }
  }
  const executions = [...byTx.values()].sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0));
  return {executions, operators};
}

/// Union only. Throws if no operator answered, so an empty ledger is never rendered
/// in place of a failed read.
export async function readExecutions(id: bigint): Promise<Execution[]> {
  const {executions, operators} = await readExecutionsAudit(id);
  if (operators.every((o) => o.status === "failed")) throw new Error("no RPC operator answered");
  return executions;
}


/// Confirms each subgraph-reported execution against its own transaction receipt.
///
/// Replaces a getLogs-based count as the chain cross-check. Counting logs over the
/// contract's whole history proved unworkable in practice: Alchemy's free tier caps
/// eth_getLogs at a 10-block range, 1rpc.io dropped Sepolia from its free tier and
/// returned empty results for a day before saying so, and publicnode answered the
/// browser differently from curl. Receipts are per-hash and deterministic — every
/// tier serves them, and there is no range for an operator to quietly truncate.
///
/// A row is confirmed only if the receipt succeeded AND contains a MandateExecuted
/// log emitted by Envoyage. A receipt that is reachable but does not match is a
/// finding about the subgraph, and is reported as such rather than hidden.
export type ReceiptCheck = {txHash: Hex; result: "confirmed" | "mismatch" | "unreachable"};

export async function verifyExecutionReceipts(txHashes: Hex[]): Promise<ReceiptCheck[]> {
  const topic0 = keccak256(toBytes("MandateExecuted(uint256,uint256,uint256,uint128)"));
  return Promise.all(
    txHashes.map(async (txHash): Promise<ReceiptCheck> => {
      try {
        const r = await publicClient.getTransactionReceipt({hash: txHash});
        const emitted = r.logs.some(
          (l) => l.address.toLowerCase() === ENVOYAGE.toLowerCase() && l.topics[0] === topic0
        );
        return {txHash, result: r.status === "success" && emitted ? "confirmed" : "mismatch"};
      } catch {
        return {txHash, result: "unreachable"};
      }
    })
  );
}

/// Reads the mandate's scope back out of ENS, the way any third party would.
///
/// @dev Deliberately goes through the resolver rather than reusing the values already
///      read from the contract. Showing contract state under an ENS heading would be
///      a claim about ENS rather than a demonstration of it — the point is that these
///      records resolve for someone who has never heard of our app.
export async function readEnsScope(positionId: bigint) {
  const node = (await publicClient.readContract({
    address: ENVOYAGE_NAMES,
    abi: namesAbi,
    functionName: "nodeFor",
    args: [positionId]
  })) as Hex;

  const keys = [
    "envoyage:keeper",
    "envoyage:maxFeeBps",
    "envoyage:minInterval",
    "envoyage:actions",
    "envoyage:lastRun"
  ];

  const values = await Promise.all(
    keys.map((k) =>
      publicClient.readContract({
        address: ENS_RESOLVER,
        abi: resolverAbi,
        functionName: "text",
        args: [node, k]
      }) as Promise<string>
    )
  );

  const out: Record<string, string> = {};
  keys.forEach((k, i) => (out[k] = values[i]));
  return {node, records: out};
}

// ── app reads (Unit 1) ───────────────────────────────────────────────────────

const registryAbi = [
  {type: "function", name: "findTokenId", stateMutability: "view", inputs: [{type: "string"}], outputs: [{type: "uint256"}]},
  {type: "function", name: "ownerOf", stateMutability: "view", inputs: [{type: "uint256"}], outputs: [{type: "address"}]}
] as const;

/// Who owns the ENS label for a position, asked of the registry itself. The zero
/// address means the label is not registered (or was retired). Used by the hire
/// flow to decide whether `retire` must precede `publish`.
export async function readNameOwner(positionId: bigint): Promise<Address> {
  const id = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: registryAbi,
    functionName: "findTokenId",
    args: [positionId.toString()]
  })) as bigint;
  if (id === 0n) return "0x0000000000000000000000000000000000000000";
  return (await publicClient
    .readContract({address: ENS_REGISTRY, abi: registryAbi, functionName: "ownerOf", args: [id]})
    .catch(() => "0x0000000000000000000000000000000000000000")) as Address;
}

/// activeMandate[tokenId] on Envoyage: 0 when the position carries no live mandate.
export async function readActiveMandate(tokenId: bigint): Promise<bigint> {
  return (await publicClient.readContract({
    address: ENVOYAGE,
    abi: envoyageAbi,
    functionName: "activeMandate",
    args: [tokenId]
  })) as bigint;
}
