/// How the three registries fit. Every arrow is a real transaction or read on
/// Sepolia today.
///
/// The previous version placed every label at hand-authored coordinates in a
/// 900×470 box with eight crossing edges, and four labels in the middle-right
/// region sat on top of each other and on the arrows. That cannot be nudged into
/// correctness — it is structural. Three things fix it:
///
///   1. Fewer crossings. The nodes are reordered so related ones are adjacent:
///      the two actors on the top row, Envoyage in the middle, and the three
///      registries along the bottom, each directly below the thing that uses it.
///      No two edges cross.
///   2. Every label sits on a STRAIGHT segment of its own edge, with an anchor
///      chosen from which side of the rail it hangs — never floating at a point
///      guessed between two diagonals.
///   3. Colour carries the source. Uniswap pink, Graph violet, ENS blue appear
///      only on edges and node outlines, never as a fill, so the section above
///      that names the three registries and the edges down here are keyed to each
///      other. Amber stays on the top edge of the Envoyage node alone.
///
/// The two caption lines used to live inside the viewBox, centred on a 900-unit
/// box — so the longest one overflowed and was clipped at both ends at every
/// width. They are real HTML now, and wrap.
const NODES = [
  {x: 30, y: 40, w: 330, h: 96, title: "Owner", sub: "holds position #38896", mono: "revoke() any time, no notice", stroke: "var(--ink)"},
  {x: 840, y: 40, w: 330, h: 96, title: "Bot, the keeper", sub: "the one address in the mandate", mono: "only call: compound(id, minFee)", stroke: "var(--ink)"},
  {x: 420, y: 230, w: 340, h: 100, title: "Envoyage", sub: "immutable, no admin, no upgrade", mono: "assembles the actions itself", stroke: "var(--ink)", cap: true},
  {x: 30, y: 420, w: 330, h: 96, title: "Uniswap v4 PositionManager", sub: "harvest, then reinvest", mono: "recipient fixed to the owner", stroke: "var(--uni)"},
  {x: 420, y: 430, w: 340, h: 96, title: "ENS v2", sub: "38896.envoyage.eth", mono: "the terms, readable anywhere", stroke: "var(--ens)"},
  {x: 840, y: 420, w: 330, h: 96, title: "The Graph", sub: "envoyage subgraph, census", mono: "work queue and public ledger", stroke: "var(--graph)"}
];

/// Each label is anchored to a straight run of its own path. `anchor` says which
/// way it hangs off that run, so a label never has to be nudged to clear a line.
type Label = {x: number; y: number; t: string; anchor?: "start" | "middle" | "end"};
const EDGES: {d: string; stroke: string; labels: Label[]}[] = [
  {d: "M360,88 H470 V230", stroke: "var(--ink)", labels: [{x: 482, y: 78, t: "approve, grant(terms)"}]},
  {d: "M420,300 H160 V136", stroke: "var(--ink)", labels: [{x: 172, y: 225, t: "revoke()"}]},
  {d: "M840,88 H710 V230", stroke: "var(--ink)", labels: [{x: 828, y: 78, t: "compound(id, minFee)", anchor: "end"}]},
  {d: "M470,330 V372 H240 V420", stroke: "var(--uni)", labels: [{x: 355, y: 362, t: "harvest fees, reinvest fees", anchor: "middle"}]},
  {d: "M590,330 V430", stroke: "var(--ens)", labels: [{x: 604, y: 365, t: "publish terms;"}, {x: 604, y: 383, t: "keeper writes lastRun only"}]},
  {d: "M200,516 V560 H1005 V516", stroke: "var(--uni)", labels: [{x: 600, y: 582, t: "emits Approval, MandateExecuted; indexed", anchor: "middle"}]},
  {d: "M1005,420 V136", stroke: "var(--graph)", labels: [{x: 993, y: 250, t: "which mandates name me,", anchor: "end"}, {x: 993, y: 268, t: "longest unserved first", anchor: "end"}]},
  {d: "M80,136 V420", stroke: "var(--ink)", labels: [{x: 92, y: 290, t: "owns"}]}
];

export function FitDiagram() {
  return (
    <figure className="fit" aria-labelledby="fit-cap">
      {/* The diagram is legible at its own size or not at all: scaled into 375px
          its 12.5px labels would render at under 4px. So it scrolls sideways on a
          narrow screen rather than shrinking into illegibility — the one case
          where horizontal scroll is the correct answer, and why overflow-check.sh
          ignores anything inside a scrolling ancestor. */}
      <div className="fit-scroll">
        <svg viewBox="0 0 1200 610" className="fit-svg" role="img" aria-label="How Envoyage fits together">
          <defs>
            <marker id="fd-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>

          {EDGES.map((e, i) => (
            <g key={`e${i}`}>
              <path d={e.d} fill="none" stroke={e.stroke} strokeWidth={1.25} markerEnd="url(#fd-head)" />
              {e.labels.map((l, j) => (
                <text key={j} x={l.x} y={l.y} textAnchor={l.anchor ?? "start"} className="fd-label">
                  {l.t}
                </text>
              ))}
            </g>
          ))}

          {NODES.map((n) => (
            <g key={n.title}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="var(--paper)" stroke={n.stroke} strokeWidth={1.25} />
              {/* Amber marks the one node that is the product, on its top edge
                  only — the accent is a nameplate, not a fill. */}
              {n.cap && <line x1={n.x} y1={n.y} x2={n.x + n.w} y2={n.y} stroke="var(--amber-fill)" strokeWidth={3} />}
              <text x={n.x + 18} y={n.y + 34} className="fd-title">
                {n.title}
              </text>
              <text x={n.x + 18} y={n.y + 56} className="fd-sub">
                {n.sub}
              </text>
              <text x={n.x + 18} y={n.y + 76} className="fd-label">
                {n.mono}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption id="fit-cap" className="fit-cap">
        <strong>Anyone can read what this bot may do — and after a revoke, what it once could.</strong> Uniswap v4 is what is protected · The Graph is how
        the bot knows what to do and how anyone knows what it did · ENS is how the mandate is legible without our software. Every arrow is a real
        transaction or read on Sepolia today.
      </figcaption>
    </figure>
  );
}
