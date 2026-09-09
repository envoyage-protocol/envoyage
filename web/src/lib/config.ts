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
