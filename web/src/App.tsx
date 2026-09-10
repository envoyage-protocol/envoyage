import {SessionProvider} from "./lib/session";
import {Shell} from "./ui/Shell";
import {Overview} from "./ui/Overview";
import {useTheft, OldWay, MandateTheft} from "./ui/Theft";
import {KeeperActs} from "./ui/KeeperActs";
import {ConnectPanel} from "./ui/ConnectPanel";
import {useSession} from "./lib/session";
import {SACRIFICIAL_MANDATE_ID} from "./lib/config";
import {Hire} from "./ui/Hire";
import {MyMandates} from "./ui/MyMandates";
import {Bot} from "./ui/Bot";

/// The walkthrough, preserved as the Proof tab. It targets the sacrificial mandate,
/// never #1, so the worked example on Home is permanent.
function Proof() {
  const theft = useTheft();
  return (
    <div className="walk">
      <section className="lede" aria-labelledby="w-h">
        <h1 id="w-h">
          You own a Uniswap v4 position. You want a bot to <em>compound</em> its fees.
        </h1>
        <p>Here is what happens with the only tool that exists today — and with a mandate instead.</p>
        <p className="plain">
          Three steps, in order. Every button sends a real transaction to Sepolia, and every outcome links to
          Etherscan. Your wallet plays the bot; where a step needs the owner, it says so.
        </p>
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

function Placeholder({title}: {title: string}) {
  return (
    <section className="exhibit">
      <div className="exhibit-head">
        <span className="caps">Coming in this build</span>
        <h2>{title}</h2>
      </div>
    </section>
  );
}

function Screens(route: string, go: (r: string) => void) {
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
      return <Placeholder title="Lookup" />;
    case "demo":
      return <Proof />;
    default:
      return <Overview />;
  }
}

export function App() {
  return (
    <SessionProvider>
      <Shell render={(route, go) => Screens(route, go)} />
    </SessionProvider>
  );
}
