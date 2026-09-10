/// The one-screen diagram from docs/submission/HOW-IT-FITS.md, as SVG. Every
/// arrow is a real call on Sepolia. Drawn in ink and one amber so it reads on
/// paper; text sizes are in viewBox units and scale with the width.
export function FitDiagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string, amber = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--paper)" stroke={amber ? "var(--amber)" : "var(--ink)"} strokeWidth={amber ? 2.5 : 1.5} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" className="fd-title">
        {title}
      </text>
      <text x={x + w / 2} y={y + 46} textAnchor="middle" className="fd-sub">
        {sub}
      </text>
    </g>
  );
  const arrow = (d: string, label: string, lx: number, ly: number, amber = false) => (
    <g>
      <path d={d} fill="none" stroke={amber ? "var(--amber)" : "var(--ink)"} strokeWidth={1.5} markerEnd={amber ? "url(#fd-arrow-amber)" : "url(#fd-arrow)"} />
      <text x={lx} y={ly} className="fd-label" textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <figure className="fit" aria-labelledby="fit-cap">
      <svg viewBox="0 0 900 470" role="img" aria-label="How Owner, Envoyage, Uniswap, The Graph, the bot and ENS relate">
        <defs>
          <marker id="fd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink)" />
          </marker>
          <marker id="fd-arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--amber)" />
          </marker>
        </defs>

        {box(40, 40, 180, 64, "Owner", "holds position #38896")}
        {box(360, 40, 200, 64, "Envoyage", "the contract · one function", true)}
        {box(680, 40, 180, 64, "Bot", "the keeper")}
        {box(40, 240, 200, 64, "Uniswap v4", "PositionManager")}
        {box(360, 240, 200, 64, "The Graph", "envoyage subgraph")}
        {box(680, 240, 180, 64, "ENS v2", "38896.envoyage.eth")}

        {arrow("M 220 60 L 358 60", "approve(position) + grant(terms)", 290, 50)}
        {arrow("M 358 84 L 222 84", "revoke() any time", 290, 100)}
        {arrow("M 678 72 L 562 72", "compound(id) — the only call it has", 620, 122, true)}
        {arrow("M 400 104 L 160 238", "two Uniswap calls, written by Envoyage", 250, 160, true)}
        {arrow("M 140 240 L 140 104", "", 0, 0)}
        <text x={100} y={180} className="fd-label" textAnchor="middle">
          owns
        </text>
        {arrow("M 242 272 L 358 272", "emits MandateExecuted", 300, 262)}
        {arrow("M 562 262 L 770 106", "task list: which mandates name me?", 700, 190)}
        {arrow("M 770 240 L 500 104", "", 0, 0)}
        <text x={640} y={222} className="fd-label" textAnchor="middle">
          writes one key: envoyage:lastRun
        </text>
        {arrow("M 560 100 L 700 238", "publishes the scope as text records", 560, 200, true)}

        <text x={450} y={370} textAnchor="middle" className="fd-foot">
          Anyone can read what this bot may do — and after revoke, what it once could.
        </text>
        <text x={450} y={396} textAnchor="middle" className="fd-sub">
          Uniswap is what is protected · The Graph is how the bot knows what to do and how anyone knows what it did · ENS is how the mandate is legible without our software
        </text>
        <text x={450} y={440} textAnchor="middle" className="fd-sub">
          Every arrow is a real transaction or read on Sepolia today.
        </text>
      </svg>
      <figcaption id="fit-cap" className="visually-hidden">
        The owner approves a position to Envoyage and grants terms; Envoyage alone calls the Uniswap PositionManager; the bot's only call is compound;
        the subgraph gives the bot its task list and records executions; ENS publishes the scope and lets the bot write one key.
      </figcaption>
    </figure>
  );
}
