import {createContext, useContext, useEffect, useState, type ReactNode} from "react";
import type {Address, WalletClient} from "viem";
import {connect as walletConnect, hasWallet, onAccountChange} from "./wallet";
import {CHAIN} from "./config";

type Session = {
  account: Address | null;
  client: WalletClient | null;
  connecting: boolean;
  error: string | null;
  available: boolean;
  connect(): Promise<void>;
  /// The wallet's current chain, or null before it is known.
  chainId: number | null;
  /// True when there is no account yet (nothing to gate) or the wallet is on Sepolia.
  onSepolia: boolean;
  switchToSepolia(): Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({children}: {children: ReactNode}) {
  const [account, setAccount] = useState<Address | null>(null);
  const [client, setClient] = useState<WalletClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  async function readChain() {
    try {
      const hex = (await window.ethereum?.request({method: "eth_chainId"})) as string | undefined;
      if (hex) setChainId(parseInt(hex, 16));
    } catch {
      /* no wallet, or it refused: stays unknown */
    }
  }

  async function switchToSepolia() {
    try {
      await window.ethereum?.request({
        method: "wallet_switchEthereumChain",
        params: [{chainId: `0x${CHAIN.id.toString(16)}`}]
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    readChain();
  }

  useEffect(() => {
    readChain();
    const eth = window.ethereum;
    if (!eth?.on) return;
    const h = (...a: unknown[]) => setChainId(parseInt(String(a[0]), 16));
    eth.on("chainChanged", h);
    return () => eth.removeListener?.("chainChanged", h);
  }, []);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const {client, account} = await walletConnect();
      setClient(client);
      setAccount(account);
      readChain();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  // The demo switches between the owner key and the keeper key in the wallet. The
  // client is rebuilt so writes go out from whichever account is now selected.
  useEffect(
    () =>
      onAccountChange((a) => {
        setAccount(a);
        if (a) walletConnect().then((r) => setClient(r.client)).catch(() => setClient(null));
        else setClient(null);
      }),
    []
  );

  return (
    <Ctx.Provider
      value={{
        account,
        client,
        connecting,
        error,
        available: hasWallet(),
        connect,
        chainId,
        onSepolia: !account || chainId === null || chainId === CHAIN.id,
        switchToSepolia
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/// Hash routing, so the app is a single static file with no server rewrite rules —
/// one less thing to configure on demo day.
export function useRoute(): [string, (to: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, "") || "";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const h = () => setRoute(read());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return [route, (to) => (window.location.hash = `/${to}`)];
}
