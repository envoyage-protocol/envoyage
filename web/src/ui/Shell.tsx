import {type ReactNode} from "react";
import {useRoute} from "../lib/session";
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

/// Letterhead, nav, wallet, network banner.
///
/// The landing rule is gone, deliberately. It took a wallet that already held
/// mandates and sent it to My mandates on arrival, which made sense when "" was
/// Home. Proof-first retired it: "" must not be hijacked, since it is the demo's
/// opening screen, and the only other candidate — "how" — is a destination
/// somebody CLICKS in the nav. Pointed there, the rule made "How it works"
/// unreachable for exactly the people who have mandates. A returning owner now
/// lands on Proof and presses My mandates themselves, which costs one click and
/// never takes a screen away from them.
export function Shell({render}: {render: (route: string, go: (r: string) => void) => ReactNode}) {
  const [route, go] = useRoute();


  return (
    <div className="page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <button className="brand" onClick={() => go("")} aria-label="Envoyage home">
          {/* The real mark, at 512x512 square — the old logo.png was 1506x1044, so
              object-fit shrank it to roughly 32x22 and it turned to mush.
              Rendered at three sizes on both grounds, this artwork is excellent
              on black down to 24px and ILLEGIBLE on white, because the "E" is
              warm white: it was drawn for dark grounds, exactly as UI-REVIEW
              says. So light mode gives it the ground it wants — an ink plate —
              instead of a filter that inverts the brand's own colours. */}
          <span className="plate" aria-hidden="true">
            <img src="/logo-mark.png" alt="" width={32} height={32} />
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
