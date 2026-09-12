import {FitDiagram} from "./FitDiagram";
import {Overview} from "./Overview";
import {REFERENCE_KEEPER} from "../lib/config";
import {short} from "./kit";

/// What it is → what a mandate is → how the three registries fit → the worked
/// example, the ledger and the census (Overview).
///
/// That order is deliberate and predates this redesign: what it is, the mandate,
/// proof it works, anyone can verify, why it matters, where the numbers come
/// from. It was hard-won, so the restyle does not reorder it — the two new
/// sections slot into the places the argument already had.
export function Home({go}: {go: (r: string) => void}) {
  return (
    <>
      <section className="hero" aria-labelledby="home-h">
        <h1 id="home-h">A permission layer for Uniswap v4 automation.</h1>
        <div className="hero-side">
          <p>
            An LP grants a bot a <strong>mandate</strong> instead of an approval. The mandate says what the bot may do, not only which position.
            Envoyage writes the Uniswap instructions itself, with the owner's address fixed in code, and publishes the terms to ENS where anyone
            can read them.
          </p>
          <p className="hero-actions">
            <button className="act act-primary" onClick={() => go("hire")}>
              Hire a keeper
            </button>
            <button className="act act-ghost" onClick={() => go("lookup/1")}>
              Look up mandate No. 1
            </button>
          </p>
        </div>
      </section>

      {/* The product's whole idea, expressed as layout. An approval says WHICH
          position; a mandate says WHAT the bot may do. Putting the two side by
          side makes that a comparison the reader performs rather than a claim
          they are asked to accept — and the struck-through lines are the same
          four capabilities, kept in the same order on both sides, so the only
          thing that changes between the columns is what is permitted. */}
      <section className="compare" aria-labelledby="cmp-h">
        <h2 id="cmp-h">An approval, and a mandate</h2>
        <p className="section-sub">The same bot, the same position. The difference is what the permission is able to say.</p>
        <div className="compare-grid">
          <div className="compare-col">
            <span className="caps">What you sign today</span>
            <h3>An approval</h3>
            <span className="compare-label">it says</span>
            <p className="compare-quote">“This contract may move position #38896.”</p>
            <span className="compare-label">which permits</span>
            <ul className="compare-list">
              <li>compounding your fees</li>
              <li>withdrawing all liquidity</li>
              <li>sending the proceeds anywhere</li>
              <li>acting a year from now, at any rate</li>
            </ul>
            <p className="compare-foot bad">scope: the position. limit: none.</p>
          </div>
          <div className="compare-col">
            <span className="caps">What you sign here</span>
            <h3>A mandate</h3>
            <span className="compare-label">it says</span>
            {/* Every value here is real and stable: the keeper comes from config,
                and #38896 / 2% are mandate No. 1's own pinned terms (a mandate's
                terms are never mutable after the grant). The cooldown is stated
                as a shape rather than a number — the design mock said "every 5
                minutes" where the live record resolves 60, and a fabricated
                figure two sections above a card that invites you to check it
                against ENS is the one mistake this page cannot afford. */}
            <p className="compare-quote">
              “{short(REFERENCE_KEEPER)} may call compound on #38896, keep at most 2% of what it harvests, no more than once per cooldown, until
              it expires.”
            </p>
            <span className="compare-label">which permits</span>
            <ul className="compare-list">
              <li>compounding your fees</li>
              <li className="struck">withdrawing all liquidity</li>
              <li className="struck">sending the proceeds anywhere</li>
              <li className="struck">acting a year from now, at any rate</li>
            </ul>
            <p className="compare-foot ok">scope: one action. limit: rate, share, expiry, and your address in code.</p>
          </div>
        </div>
      </section>

      {/* The three integrations used to read as badges — three logos next to the
          thing they touch, which tells a judge nothing about what each one DOES.
          Each gets its source colour on a top rule, the same colour its edges
          carry in the diagram below, and a "without it" line naming the specific
          guarantee that disappears if you remove it. */}
      <section className="registries" aria-labelledby="reg-h">
        <div className="section-head">
          <h2 id="reg-h">One mechanism, three registries</h2>
          <p className="section-sub">
            Each holds a different part of the mandate. Remove any one and a specific guarantee disappears — named below, in the colour its edges
            carry in the diagram.
          </p>
        </div>
        <div className="registry-grid">
          <div className="registry" data-src="uni">
            <span className="registry-src">Uniswap v4 — the money</span>
            <h3>Where the work happens</h3>
            <p>
              Envoyage assembles the harvest and reinvest actions itself and hands them to the PositionManager with the recipient hard-coded to
              you.
            </p>
            <p className="registry-without">without it: no yield to compound</p>
          </div>
          <div className="registry" data-src="ens">
            <span className="registry-src">ENS v2 — the contract</span>
            <h3>Where the terms live</h3>
            <p>
              Every term is a text record on 38896.envoyage.eth. Any wallet, explorer or rival frontend can read the scope without trusting this
              page.
            </p>
            <p className="registry-without">without it: the terms are only readable through us</p>
          </div>
          <div className="registry" data-src="graph">
            <span className="registry-src">The Graph — the record</span>
            <h3>Where the proof lives</h3>
            <p>Indexes every execution into a public ledger, and tells the keeper which mandates name it, longest unserved first.</p>
            <p className="registry-without">without it: no work queue, and you take our word on what ran</p>
          </div>
        </div>
        <FitDiagram />
      </section>

      <Overview />
    </>
  );
}
