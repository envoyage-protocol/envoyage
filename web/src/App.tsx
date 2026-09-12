import {SessionProvider} from "./lib/session";
import {Shell} from "./ui/Shell";
import {Home} from "./ui/Home";
import {useTheft, OldWay, MandateTheft} from "./ui/Theft";
import {KeeperActs} from "./ui/KeeperActs";
import {ConnectPanel} from "./ui/ConnectPanel";
import {useSession} from "./lib/session";
import {SACRIFICIAL_MANDATE_ID} from "./lib/config";
import {Hire} from "./ui/Hire";
import {MyMandates} from "./ui/MyMandates";
import {Bot} from "./ui/Bot";
import {Lookup} from "./ui/Lookup";

/// The walkthrough, preserved as the Proof tab. It targets the sacrificial mandate,
/// never #1, so the worked example on Home is permanent.
function Proof() {
  const theft = useTheft();
  return (
    <div className="walk">
      {/* The headline is a claim about the reader, not a setup. "You own a
          position, you want a bot" spent two sentences arriving at the point;
          this IS the point, and it is true of everyone who has ever approved an
          automation contract. The three acts are named up front so a viewer
          knows the shape before committing to it — this screen is the first
          thing anyone sees, and it has about three seconds. */}
      <section className="lede proof-lede" aria-labelledby="w-h">
        <div>
          <p className="eyebrow mono">start here — two minutes</p>
          <h1 id="w-h">Every automation bot you approve today can take your position.</h1>
          <p>
            Not a hypothetical. Below, the same bot sends the same instruction to two contracts. One pays you. One drains you.{" "}
            <strong>Run both yourself</strong> — any wallet with Sepolia ETH will do, you do not need ours.
          </p>
        </div>
        <aside className="acts" aria-label="The three acts">
          <p className="eyebrow mono">the three acts</p>
          <ol>
            <li>The theft, on a live testnet</li>
            <li>The same theft, refused by a mandate</li>
            <li>The owner ends it, mid-flight</li>
          </ol>
        </aside>
      </section>
      <OldWay t={theft} />
      <KeeperActs mandateId={SACRIFICIAL_MANDATE_ID} theftSide={<MandateTheft t={theft} />} />
    </div>
  );
}

/// A gated screen: the connect panel until there is an account, then the screen.
function Gated({headline, why, children}: {headline: string; why: string; children: React.ReactNode}) {
  const {account} = useSession();
  if (!account) return <ConnectPanel headline={headline} why={why} />;
  return <>{children}</>;
}

function Screens(route: string, go: (r: string) => void) {
  if (route.startsWith("lookup/")) return <Lookup key={route} initial={decodeURIComponent(route.slice("lookup/".length))} />;
  switch (route) {
    case "hire":
      return (
        <Gated headline="Hire a keeper" why="Connect the wallet that owns the position. The bot is pre-filled; you set the terms.">
          <Hire go={go} />
        </Gated>
      );
    case "mandates":
      return (
        <Gated headline="My mandates" why="Connect the wallet that granted them to see status, executions and names.">
          <MyMandates go={go} />
        </Gated>
      );
    case "bot":
      return (
        <Gated headline="Bot" why="Connect a wallet named as keeper by a mandate to see what it may do right now.">
          <Bot />
        </Gated>
      );
    case "lookup":
      return <Lookup />;
    case "how":
      return <Home go={go} />;
    // "" is the landing route and "demo" is its alias, so links already written
    // against #/demo keep resolving after Proof moved to the front.
    case "":
    case "demo":
      return <Proof />;
    default:
      return <Proof />;
  }
}

export function App() {
  return (
    <SessionProvider>
      <Shell render={(route, go) => Screens(route, go)} />
    </SessionProvider>
  );
}
