/**
 * The Graph as the keeper's source of truth about WHAT IT MAY DO.
 *
 * This is load-bearing, not decorative. The bot does not scan logs to find its work:
 * it asks the subgraph which mandates name it, what each one permits, and how each has
 * behaved, then decides which are worth acting on and in what order. Take the subgraph
 * away and the bot has no work list.
 *
 * It replaced an eth_getLogs scan that had a failure mode worth recording: over a wide
 * block range a public RPC can return an EMPTY array rather than an error, so the bot
 * reported "no mandates granted" while a live mandate sat on chain naming it. An empty
 * answer and no answer were indistinguishable. An indexer answers the question once,
 * at the head, with no range to get wrong.
 */

const ENDPOINT =
  process.env.SUBGRAPH_URL ?? "https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4";

export type Work = {
  mandateId: bigint;
  positionId: bigint;
  maxFeeBps: number;
  minInterval: bigint;
  expiry: bigint;
  lastExecutedAt: bigint | null;
  executionCount: number;
  totalLiquidityAdded: bigint;
};

type Row = {
  mandateId: string;
  maxFeeBps: number;
  minInterval: string;
  expiry: string;
  lastExecutedAt: string | null;
  executionCount: number;
  totalLiquidityAdded: string;
  position: {id: string};
};

const QUERY = `
  query Work($keeper: String!, $now: BigInt!) {
    mandates(
      where: { keeper: $keeper, status: ACTIVE, compoundAllowed: true, expiry_gt: $now }
      orderBy: lastExecutedAt
      orderDirection: asc
    ) {
      mandateId
      maxFeeBps
      minInterval
      expiry
      lastExecutedAt
      executionCount
      totalLiquidityAdded
      position { id }
    }
  }`;

/// @dev The filtering is done by the indexer, not here: revoked, expired and
///      compound-disabled mandates never reach the bot. Ordering by lastExecutedAt
///      ascending means the longest-neglected position is served first, which a log
///      scan cannot express at all — it has no idea what happened after the grant.
export async function fetchWork(keeper: string): Promise<Work[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      query: QUERY,
      variables: {keeper: keeper.toLowerCase(), now: Math.floor(Date.now() / 1000).toString()}
    })
  });

  if (!res.ok) throw new Error(`subgraph ${res.status}`);
  const body = (await res.json()) as {data?: {mandates: Row[]}; errors?: {message: string}[]};
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  // A missing `data` is a failure, not an empty work list. Treating it as "nothing to
  // do" is precisely the bug this module was written to remove.
  if (!body.data) throw new Error("subgraph returned no data");

  return body.data.mandates.map((m) => ({
    mandateId: BigInt(m.mandateId),
    positionId: BigInt(m.position.id),
    maxFeeBps: m.maxFeeBps,
    minInterval: BigInt(m.minInterval),
    expiry: BigInt(m.expiry),
    lastExecutedAt: m.lastExecutedAt === null ? null : BigInt(m.lastExecutedAt),
    executionCount: m.executionCount,
    totalLiquidityAdded: BigInt(m.totalLiquidityAdded)
  }));
}

/// @dev Cheap local skip using indexed history. The contract enforces the cooldown
///      regardless — this only avoids paying gas to be told so.
export function cooldownRemaining(w: Work, nowSec: number): bigint {
  if (w.lastExecutedAt === null) return 0n;
  const ready = w.lastExecutedAt + w.minInterval;
  const now = BigInt(nowSec);
  return now >= ready ? 0n : ready - now;
}
