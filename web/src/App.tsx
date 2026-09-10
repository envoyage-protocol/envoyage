import {SessionProvider, useRoute} from "./lib/session";
import {WalletBar} from "./ui/WalletBar";
import {Overview} from "./ui/Overview";
import {Theft} from "./ui/Theft";
import {KeeperActs} from "./ui/KeeperActs";
import {ENVOYAGE, EXPLORER} from "./lib/config";
import {short} from "./ui/kit";

function Nav({route, go}: {route: string; go: (r: string) => void}) {
  const tabs = [
    ["", "Overview"],
    ["demo", "Try it live"]
  ] as const;
  return (
    <nav className="tabs">
      {tabs.map(([r, label]) => (
        <button key={r} className={route === r ? "tab on" : "tab"} onClick={() => go(r)} aria-current={route === r}>
          {label}
        </button>
      ))}
    </nav>
  );
}

function Walkthrough() {
  return (
    <div className="walk">
      <section className="lede" aria-labelledby="w-h">
        <h1 id="w-h">
          Don't take our word for it. <em>Perform</em> the attack.
        </h1>
        <p>
          Connect any wallet. Every button below sends a real transaction to Sepolia — the theft that
          drains a naive contract, the same theft that a mandate has no way to receive, a compound that
          grows a position, and a revoke that kills the keeper. Nothing here is a fixture or a claim.
        </p>
      </section>
      <Theft />
      <KeeperActs />
    </div>
  );
}

function Shell() {
  const [route, go] = useRoute();
  return (
    <div className="page">
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
          <p className="chain">
            <span className="dot" aria-hidden="true" /> Sepolia ·{" "}
            <a className="mono" href={`${EXPLORER}/address/${ENVOYAGE}#code`} target="_blank" rel="noreferrer">
              {short(ENVOYAGE)}
            </a>
          </p>
          <WalletBar />
        </div>
      </header>

      {route === "demo" ? <Walkthrough /> : <Overview />}
    </div>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
