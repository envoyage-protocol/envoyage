import {createContext, useContext, useEffect, useState, type ReactNode} from "react";
import type {Address, WalletClient} from "viem";
import {connect as walletConnect, hasWallet, onAccountChange} from "./wallet";

type Session = {
  account: Address | null;
  client: WalletClient | null;
  connecting: boolean;
  error: string | null;
  available: boolean;
  connect(): Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({children}: {children: ReactNode}) {
  const [account, setAccount] = useState<Address | null>(null);
  const [client, setClient] = useState<WalletClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const {client, account} = await walletConnect();
      setClient(client);
      setAccount(account);
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
    <Ctx.Provider value={{account, client, connecting, error, available: hasWallet(), connect}}>
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
