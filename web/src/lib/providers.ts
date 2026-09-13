import type {Eip1193} from "./wallet";

/// EIP-6963 provider discovery.
///
/// `window.ethereum` is one global slot and every extension writes to it, so the
/// last one to load wins and the page has no way to offer a choice. A judge with
/// both Rabby and MetaMask installed gets whichever won, which is exactly the
/// trap that cost an afternoon here: Rabby held the slot, signed with a stale
/// nonce, and there was no control anywhere on the page to pick the other one.
///
/// EIP-6963 replaces the race with an announcement: the page asks, each wallet
/// answers with its own provider object and an identity. Nothing is overwritten.
///
/// The fallback is the whole point of the design: when no wallet announces —
/// an older extension, or a browser that injects the legacy way only — this
/// returns `window.ethereum` and the app behaves exactly as it did before.
export type ProviderInfo = {uuid: string; name: string; icon: string; rdns: string};
type Detail = {info: ProviderInfo; provider: Eip1193};

const KEY = "envoyage:provider";
const found = new Map<string, Detail>();
const listeners = new Set<() => void>();
let chosen: string | null = null;

try {
  chosen = localStorage.getItem(KEY);
} catch {
  /* storage blocked: the choice simply does not survive a reload */
}

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const d = (e as CustomEvent<Detail>).detail;
    if (!d?.info?.rdns || found.has(d.info.rdns)) return;
    found.set(d.info.rdns, d);
    listeners.forEach((f) => f());
  });
  // Wallets that were already listening answer this synchronously.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function listProviders(): Detail[] {
  return [...found.values()];
}

/// Re-ask. Extensions injected after first paint miss the initial request.
export function rediscover() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function subscribeProviders(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function chosenRdns(): string | null {
  return chosen;
}

export function selectProvider(rdns: string | null) {
  chosen = rdns;
  try {
    if (rdns) localStorage.setItem(KEY, rdns);
    else localStorage.removeItem(KEY);
  } catch {
    /* the choice still holds for this page view */
  }
  listeners.forEach((f) => f());
}

/// The provider every call in wallet.ts goes through.
///
/// Order matters: an explicit choice wins; a single announced wallet is not a
/// choice anyone needs to make; otherwise the legacy slot, which is also the
/// only thing available when discovery finds nothing.
export function activeProvider(): Eip1193 | undefined {
  if (chosen) {
    const d = found.get(chosen);
    if (d) return d.provider;
  }
  if (found.size === 1) return [...found.values()][0].provider;
  // Two or more announced and nothing picked: there is no defensible answer, so
  // give none. Falling back to window.ethereum here looks harmless and is not —
  // `restore()` would silently reconnect through whichever extension won the
  // slot, which is the exact behaviour this module exists to end, and the user
  // would never see the choice they were owed.
  if (found.size > 1) return undefined;
  return typeof window !== "undefined" ? window.ethereum : undefined;
}

/// A wallet exists even when none is usable yet: several announced and the user
/// has not chosen. The connect gate must stay up rather than offering to install
/// something they already have.
export function anyProvider(): boolean {
  if (found.size > 0) return true;
  return typeof window !== "undefined" && !!window.ethereum;
}
