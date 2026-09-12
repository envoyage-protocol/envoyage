import {useEffect, useRef, type ReactNode} from "react";
import {useRoute, useSession} from "../lib/session";
import {fetchMandatesByGrantor} from "../lib/graph";
import {ENVOYAGE, EXPLORER} from "../lib/config";
import {WalletBar} from "./WalletBar";
import {NetworkBanner} from "./NetworkBanner";
import {short} from "./kit";

/// Proof first, deliberately. The spine of the demo is the theft, then the mandate
/// that stops it, then hiring one — so the landing route ("") is the Proof screen
/// and the explanation lives at "how". "demo" stays as an alias for "" so every
/// link already written against #/demo keeps resolving.
export const ROUTES = [
  ["", "Proof"],
  ["how", "How it works"],
  ["hire", "Hire a keeper"],
  ["mandates", "My mandates"],
  ["bot", "Bot"],
  ["lookup", "Lookup"]
] as const;
export type Route = (typeof ROUTES)[number][0];

function Nav({route, go}: {route: string; go: (r: string) => void}) {
  return (
    <nav className="tabs" aria-label="Sections">
      {ROUTES.map(([r, label]) => (
        <button key={r} className={route === r ? "tab on" : "tab"} onClick={() => go(r)} aria-current={route === r ? "page" : undefined}>
          {label}
        </button>
      ))}
    </nav>
  );
}

/// Letterhead, nav, wallet, network banner — and the landing rule: a wallet that
/// already holds mandates lands on My mandates, once per account, only from Home.
export function Shell({render}: {render: (route: string, go: (r: string) => void) => ReactNode}) {
  const [route, go] = useRoute();
  const {account} = useSession();
  const redirected = useRef<string | null>(null);

  useEffect(() => {
    if (!account || redirected.current === account) return;
    // Only from Home. This used to fire from the landing route, which is now
    // Proof — so connecting a wallet during the demo would have bounced the
    // presenter off the opening screen mid-sentence.
    //
    // The route check comes BEFORE the one-shot ref is consumed, and `route` is
    // in the deps. With the ref set first, connecting on Proof (which is now
    // where people connect) burned the one shot and the rule could never fire
    // again for that account — inert, and wallet-gated, so nothing would have
    // caught it.
    if (route !== "how") return;
    redirected.current = account;
    fetchMandatesByGrantor(account)
      .then((d) => {
        if (d.mandates.length > 0 && window.location.hash.replace(/^#\/?/, "") === "how") go("mandates");
      })
      .catch(() => {
        /* the subgraph being down must not block landing */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, route]);

  return (
    <div className="page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <button className="brand" onClick={() => go("")} aria-label="Envoyage home">
          <span className="plate" aria-hidden="true">
            <img src="/logo.png" alt="" width={32} height={32} />
          </span>
          <span className="word">
            Envoyage
            <small>Scoped keeper mandates · Uniswap v4</small>
          </span>
        </button>
        <div className="masthead-right">
          <Nav route={route} go={go} />
          <p className="chip chain">
            <i className="dot" aria-hidden="true" />
            Sepolia
            <a href={`${EXPLORER}/address/${ENVOYAGE}#code`} target="_blank" rel="noreferrer">
              {short(ENVOYAGE)}
            </a>
          </p>
          <WalletBar />
        </div>
      </header>
      <NetworkBanner />
      <main id="main">{render(route, go)}</main>
    </div>
  );
}
