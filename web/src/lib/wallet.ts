import {createWalletClient, custom, type Address, type WalletClient, type Hex} from "viem";
import {CHAIN} from "./config";

/// The injected provider (MetaMask, Rabby, …). viem talks to it directly, so the app
/// carries no wallet SDK — one less thing that can break on demo day.
type Eip1193 = {
  request(args: {method: string; params?: unknown[]}): Promise<unknown>;
  on?(event: string, cb: (...a: unknown[]) => void): void;
  removeListener?(event: string, cb: (...a: unknown[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

/// Silently restore a connection this origin was already granted.
///
/// `eth_accounts` is the non-prompting twin of `eth_requestAccounts`: it returns
/// the accounts the user has already approved for this site and opens nothing.
/// An empty array means never connected, or the wallet is locked — both of which
/// correctly leave the connect gate up.
///
/// It deliberately does NOT do connect()'s chain switch. connect() runs because
/// someone pressed a button, so a switch prompt there is expected; running the
/// same thing on page load would pop a wallet dialog nobody asked for. A restored
/// session sitting on the wrong chain is exactly what NetworkBanner is for.
///
/// New function, additive: connect() is untouched.
export async function restore(): Promise<{client: WalletClient; account: Address} | null> {
  if (!window.ethereum) return null;
  const accounts = (await window.ethereum.request({method: "eth_accounts"})) as Address[] | undefined;
  const account = accounts?.[0];
  if (!account) return null;
  const client = createWalletClient({account, chain: CHAIN, transport: custom(window.ethereum)});
  return {client, account};
}

export async function connect(): Promise<{client: WalletClient; account: Address}> {
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask or Rabby.");

  const accounts = (await window.ethereum.request({method: "eth_requestAccounts"})) as Address[];
  const account = accounts[0];
  if (!account) throw new Error("Wallet returned no account.");

  // Sepolia only. Switch rather than fail, and add the chain if the wallet has never
  // seen it — that is the state a judge's wallet is most likely in.
  const chainIdHex = `0x${CHAIN.id.toString(16)}` as Hex;
  const current = (await window.ethereum.request({method: "eth_chainId"})) as string;
  if (current.toLowerCase() !== chainIdHex) {
    try {
      await window.ethereum.request({method: "wallet_switchEthereumChain", params: [{chainId: chainIdHex}]});
    } catch (e) {
      const code = (e as {code?: number}).code;
      if (code !== 4902) throw e;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: "Sepolia",
            nativeCurrency: {name: "Sepolia ETH", symbol: "ETH", decimals: 18},
            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"]
          }
        ]
      });
    }
  }

  const client = createWalletClient({account, chain: CHAIN, transport: custom(window.ethereum)});
  return {client, account};
}

/// Fires when the user switches account in the wallet. The demo switches between the
/// owner key and the keeper key mid-flow, so this has to be live.
export function onAccountChange(cb: (account: Address | null) => void): () => void {
  if (!window.ethereum?.on) return () => {};
  const handler = (...a: unknown[]) => {
    const accs = a[0] as Address[];
    cb(accs[0] ?? null);
  };
  window.ethereum.on("accountsChanged", handler);
  return () => window.ethereum?.removeListener?.("accountsChanged", handler);
}
