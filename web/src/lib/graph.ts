/**
 * Two Graph products, composed.
 *
 *   1. our own subgraph on Subgraph Studio — mandates, executions, and a census of
 *      the approvals granted on Uniswap v4's PositionManager
 *   2. Uniswap's v4 subgraph on the decentralized network, via the Gateway
 *
 * Neither answers the question alone. Uniswap's subgraph knows how many positions
 * exist and who holds them; it has no concept of a permission scope, because an
 * approval does not carry one. Ours knows exactly what each keeper may do, over a
 * handful of positions. Put together they say how large the exposed population is and
 * what a bounded alternative looks like against it.
 */

export const STUDIO =
  import.meta.env.VITE_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/62788/envoyage/v0.0.4";

/// Uniswap v4, Ethereum mainnet, on the decentralized network.
const UNISWAP_V4_ID = "DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G";

/// @dev A Gateway key in a client bundle is spendable by anyone who opens devtools.
///      That is an accepted trade for a demo on a free tier with a monthly cap, and
///      it is called out rather than hidden: a production build would proxy this
///      server-side. The key is read from the environment so it is never committed.
const GATEWAY_KEY = import.meta.env.VITE_GRAPH_GATEWAY_KEY as string | undefined;

async function gql<T>(url: string, query: string, variables?: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({query, variables})
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const body = (await res.json()) as {data?: T; errors?: {message: string}[]};
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  // Absence of data is a failure, never an empty result. Rendering zeroes because a
  // query silently failed is how a dashboard lies.
  if (!body.data) throw new Error("no data");
  return body.data;
}

export type Census = {
  activeBlanketApprovals: number;
  activePositionApprovals: number;
  activeScopedApprovals: number;
  activeUnscopedApprovals: number;
  distinctDelegates: number;
  totalApprovalEvents: number;
};

export type MandateRow = {
  id: string;
  status: string;
  grantor: string;
  maxFeeBps: number;
  minInterval: string;
  expiry: string;
  executionCount: number;
  totalFee0ToKeeper: string;
  totalLiquidityAdded: string;
  lastExecutedAt: string | null;
  keeper: {id: string};
  position: {id: string};
};

export type Execution = {
  id: string;
  block: string;
  timestamp: string;
  tx: string;
  fee0ToKeeper: string;
  fee1ToKeeper: string;
  liquidityAdded: string;
};

export async function fetchEnvoyage(): Promise<{
  census: Census | null;
  mandates: MandateRow[];
  executions: Execution[];
  indexedBlock: number;
}> {
  const d = await gql<{
    censuses: Census[];
    mandates: MandateRow[];
    executions: Execution[];
    _meta: {block: {number: number}};
  }>(
    STUDIO,
    `{
      _meta { block { number } }
      censuses { activeBlanketApprovals activePositionApprovals activeScopedApprovals
                 activeUnscopedApprovals distinctDelegates totalApprovalEvents }
      mandates(orderBy: mandateId) {
        id status grantor maxFeeBps minInterval expiry executionCount
        totalFee0ToKeeper totalLiquidityAdded lastExecutedAt
        keeper { id } position { id }
      }
      executions(orderBy: block, orderDirection: desc, first: 10) {
        id block timestamp tx fee0ToKeeper fee1ToKeeper liquidityAdded
      }
    }`
  );
  return {
    census: d.censuses[0] ?? null,
    mandates: d.mandates,
    executions: d.executions,
    indexedBlock: d._meta.block.number
  };
}

/// Our own census handler, deployed against Uniswap v4's PositionManager on Ethereum
/// MAINNET. Same code as the Sepolia census; different network, real money.
///
/// This replaces a dependency on Uniswap's official subgraph through the Gateway for
/// the headline figure. That subgraph returned "bad indexers … too far behind" on
/// 9 Sept, and a demo should not depend on someone else's indexers. The Gateway
/// composition is kept below as an additional source when it is up.
export const MAINNET_CENSUS =
  import.meta.env.VITE_MAINNET_CENSUS_URL ??
  "https://api.studio.thegraph.com/query/62788/envoyage-census-mainnet/v0.0.1";

export async function fetchMainnetCensus(): Promise<{census: Census; indexedBlock: number}> {
  const d = await gql<{censuses: Census[]; _meta: {block: {number: number}; hasIndexingErrors: boolean}}>(
    MAINNET_CENSUS,
    `{
      _meta { block { number } hasIndexingErrors }
      censuses { activeBlanketApprovals activePositionApprovals activeScopedApprovals
                 activeUnscopedApprovals distinctDelegates totalApprovalEvents }
    }`
  );
  if (d._meta.hasIndexingErrors) throw new Error("mainnet census has indexing errors");
  const census = d.censuses[0];
  // A census entity that does not exist yet means the sync has not reached the first
  // approval — a pending state, not zero exposure. Throw so the UI says "syncing",
  // never "0 wallets exposed".
  if (!census) throw new Error("mainnet census still syncing — no approvals indexed yet");
  return {census, indexedBlock: d._meta.block.number};
}

export type UniswapScale = {pools: string; txCount: string; sampledOwners: number};

/// The population the problem applies to. Every one of these positions that wants
/// automation has only an unbounded approval to offer it.
export async function fetchUniswapScale(): Promise<UniswapScale | null> {
  if (!GATEWAY_KEY) return null;
  const url = `https://gateway.thegraph.com/api/${GATEWAY_KEY}/subgraphs/id/${UNISWAP_V4_ID}`;
  const d = await gql<{
    poolManagers: {poolCount: string; txCount: string}[];
    positions: {owner: string}[];
  }>(
    url,
    `{
      poolManagers(first: 1) { poolCount txCount }
      positions(first: 1000, orderBy: createdAtTimestamp, orderDirection: desc) { owner }
    }`
  );
  const pm = d.poolManagers[0];
  if (!pm) return null;
  return {
    pools: pm.poolCount,
    txCount: pm.txCount,
    sampledOwners: new Set(d.positions.map((p) => p.owner)).size
  };
}
