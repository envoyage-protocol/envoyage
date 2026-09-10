import {sepolia} from "viem/chains";

export const CHAIN = sepolia;

/// Verified on Etherscan. See docs/SEPOLIA.md.
export const ENVOYAGE = "0x8466e82E02edF3F00c0387D5C3E66d407dc7259C" as const;
export const POSITION_MANAGER = "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4" as const;

/// Two operators, not two endpoints from one. A single provider's keys share a
/// failure domain, so a fallback across them never actually fails over.
///
/// Order matters: viem's fallback tries these in sequence and only moves on when a
/// call ERRORS. A keyed operator goes first because public ones rate-limit browsers.
/// 1rpc.io was removed on 9 Sept: it dropped Sepolia from its free tier and, before
/// saying so, spent a day returning empty results with HTTP 200 — an operator that
/// answers wrongly is worse than one that fails, because a fallback cannot see it.
export const RPC_URLS = [
  import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined,
  "https://ethereum-sepolia-rpc.publicnode.com"
].filter((u): u is string => !!u);

export const EXPLORER = "https://sepolia.etherscan.io";

/// The live demo mandate, so the page has something to show with no wallet
/// connected and no setup. A demo that requires setup before it shows anything is
/// a demo that fails in front of judges.
export const DEMO_MANDATE_ID = 1n;

/// Envoyage's contract-creation block, read from the transaction receipt. Log
/// queries start here; scanning from 0 times out on every public RPC.
export const DEPLOY_BLOCK = 11644424n;

/// ENSv2 (Sepolia beta). Deployed by script/06_EnsNames.s.sol.
export const ENS_PARENT = "envoyage.eth";
export const ENVOYAGE_NAMES = "0x307CF6B0022Ef757820A8C3Cfced97C324eE0d05" as const;
export const ENS_RESOLVER = "0xAF5b8aCF804e59fb823C05D37e73D523Af2Eca8a" as const;

/// The one text key a keeper may write. Everything else on the name is the owner's.
export const KEEPER_KEY = "envoyage:lastRun";

/// The deliberately vulnerable comparator, live on Sepolia (script/08_DeployNaive).
/// Its position is approved to it — the same unbounded approval every automation
/// contract asks for today — so the theft can be performed for real, not described.
export const NAIVE = "0x0Fc426408a752f46d46b1e182aa018647146Aa56" as const;
export const NAIVE_VICTIM_TOKEN_ID = 39022n;

// ── app (Units 1–7) ──────────────────────────────────────────────────────────

/// The demo pool key, copied from deployments/sepolia.json. Token addresses are
/// sorted (currency0 < currency1) as v4 requires; the hook is the zero address.
export const DEMO_POOL = {
  currency0: "0x1dC7e196Ff124C79191154C635df75a315e00985" as const,
  currency1: "0x7D5Dc05acea592601e6888ccB04D625CDc6c13DC" as const,
  fee: 10000,
  tickSpacing: 200,
  hooks: "0x0000000000000000000000000000000000000000" as const
};

/// Uniswap's canonical Permit2 and the v4 StateView on Sepolia. StateView is the
/// documented way to read slot0 from the singleton PoolManager without computing
/// extsload slots by hand.
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
export const STATE_VIEW = "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c" as const;

/// ENSv2 permissioned registry that EnvoyageNames registers subnames in (read from
/// EnvoyageNames.REGISTRY()). Used only to ask who owns a label.
export const ENS_REGISTRY = "0x6CD593BE2B0fF155120b49042Cf57089625189F6" as const;

/// The reference keeper: Envoyage's own bot, pre-filled and read-only in the hire
/// form (origin decision). It is the keeper of mandate #1.
export const REFERENCE_KEEPER = "0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B" as const;

/// The mandate the Proof tab may revoke. Mandate #1 is permanent and is never
/// revoked by any screen; this one lives on its own position and is re-granted
/// between takes. Set by the operator after granting it.
export const SACRIFICIAL_MANDATE_ID = 2n;

/// Contract limit on the keeper's share of harvested fees, in bps.
export const MAX_FEE_BPS = 1000;

/// Time-to-first-compound bound for a fresh mandate: swap-loop cadence + keeper
/// poll + indexer lag. Shown on My mandates as "expected within ~N min".
export const SWAP_CADENCE_S = 120;
export const KEEPER_POLL_S = 30;
export const INDEXER_LAG_S = 60;
export const FIRST_COMPOUND_BOUND_S = SWAP_CADENCE_S + KEEPER_POLL_S + INDEXER_LAG_S;

/// Liquidity for a demo mint. Matches the seed script's 100e18 so one swap round
/// trip on the demo pool clears ZeroLiquidityDelta for the new position too.
export const DEMO_MINT_LIQUIDITY = 100_000_000_000_000_000_000n;
/// Demo tokens minted to a wallet before it mints a position; the tokens are freely
/// mintable, so the amount only has to cover the position with margin.
export const DEMO_TOKEN_MINT = 1_000_000_000_000_000_000_000n;
