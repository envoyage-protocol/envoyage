import type {Address} from "viem";

/// Positions minted by the demo helper, remembered per wallet in this browser.
/// The PositionManager is not enumerable and the subgraph has no Transfer
/// handler, so this memory plus a paste field is the v0 position source.
const key = (account: Address) => `envoyage:minted:${account.toLowerCase()}`;

export function rememberedPositions(account: Address): bigint[] {
  try {
    const raw = localStorage.getItem(key(account));
    if (!raw) return [];
    return (JSON.parse(raw) as string[]).map((s) => BigInt(s));
  } catch {
    return [];
  }
}

export function rememberPosition(account: Address, tokenId: bigint) {
  try {
    const cur = rememberedPositions(account).filter((t) => t !== tokenId);
    localStorage.setItem(key(account), JSON.stringify([...cur, tokenId].map((t) => t.toString())));
  } catch {
    /* private mode or blocked storage: the paste field still works */
  }
}
