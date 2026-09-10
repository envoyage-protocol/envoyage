import {FitDiagram} from "./FitDiagram";
import {Overview} from "./Overview";
import {Sponsor} from "./kit";

/// One sentence, the diagram, then the worked example and the census (Overview).
export function Home({go}: {go: (r: string) => void}) {
  return (
    <>
      <section className="lede" aria-labelledby="home-h">
        <h1 id="home-h">
          A <em>permission layer</em> for Uniswap v4 automation.
        </h1>
        <p>
          A bot that can grow your position and do nothing else with it. Today the only way to let a bot compound your fees is an approval that says which position it may touch and nothing about what it may
          do. Envoyage replaces it with a <strong>mandate</strong>: a limited power of attorney whose terms are enforced by the contract, published
          as an ENS name, and indexed by a subgraph. <Sponsor name="Uniswap" /> <Sponsor name="The Graph" /> <Sponsor name="ENS" />
        </p>
        <p className="lede-actions">
          <button className="act act-primary" onClick={() => go("hire")}>
            Hire a keeper
          </button>
          <button className="act act-ghost" onClick={() => go("lookup/1")}>
            Look up mandate No. 1
          </button>
        </p>
      </section>
      <FitDiagram />
      <Overview />
    </>
  );
}
