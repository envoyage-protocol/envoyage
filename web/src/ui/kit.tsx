import {type ReactNode} from "react";
import {EXPLORER} from "../lib/config";

export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

export function Tx({hash, children}: {hash: string; children?: ReactNode}) {
  return (
    <a className="mono" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {children ?? short(hash)} ↗
    </a>
  );
}

export function Addr({addr, kind = "address"}: {addr: string; kind?: "address" | "token"}) {
  return (
    <a className="mono" href={`${EXPLORER}/${kind}/${addr}`} target="_blank" rel="noreferrer">
      {short(addr)}
    </a>
  );
}

/// One button that carries its own async lifecycle: idle → running → the outcome
/// stays on screen. A demo where the button forgets what just happened forces the
/// presenter to narrate; here the result is the label.
export type TxState =
  | {phase: "idle"}
  | {phase: "running"; note?: string}
  | {phase: "done"; note: ReactNode}
  | {phase: "failed"; note: ReactNode};

export function ActionButton({
  label,
  state,
  onClick,
  tone = "default",
  disabled
}: {
  label: string;
  state: TxState;
  onClick: () => void;
  tone?: "default" | "primary" | "hostile";
  disabled?: boolean;
}) {
  const running = state.phase === "running";
  return (
    <button
      className={`act act-${tone}`}
      onClick={onClick}
      disabled={disabled || running}
      aria-busy={running}
    >
      {running ? (state.note ?? "Working…") : label}
    </button>
  );
}

export function Outcome({state}: {state: TxState}) {
  if (state.phase === "idle" || state.phase === "running") return null;
  return (
    <p className={`outcome ${state.phase === "failed" ? "outcome-bad" : "outcome-ok"}`} role="status">
      <span aria-hidden="true">{state.phase === "failed" ? "✕" : "✓"}</span>
      <span>{state.note}</span>
    </p>
  );
}

/// A sponsor label. One shape everywhere, so a judge scanning the page sees the
/// same mark each time an integration does something.
export function Sponsor({name}: {name: "Uniswap" | "The Graph" | "ENS"}) {
  return <span className="sponsor">{name}</span>;
}

/// The seal is state, not decoration: its centre and rim are typeset from the same
/// values the articles are read from, and a revoked mandate carries a dead seal —
/// grey, and cancelled with two ink strokes. The strokes exist in the DOM only when
/// `off` is true, so the binding can be checked, not just looked at.
export function Seal({centre, rim, off}: {centre: string; rim: string; off?: boolean}) {
  return (
    <svg
      className={off ? "seal off" : "seal"}
      viewBox="0 0 132 132"
      role="img"
      aria-label={`Seal: ${centre}`}
      data-state={off ? "revoked" : "in-force"}
    >
      <defs>
        <path id="seal-rim" d="M 66,66 m -50,0 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0" />
      </defs>
      <circle cx="66" cy="66" r="63" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="66" cy="66" r="58" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="66" cy="66" r="38" fill="none" stroke="currentColor" strokeWidth="1" />
      <text className="seal-small">
        <textPath href="#seal-rim" startOffset="0">
          {rim.toUpperCase()}
        </textPath>
      </text>
      <text className="seal-centre" x="66" y="73" textAnchor="middle">
        {centre}
      </text>
      {off && (
        <g className="cancel" aria-hidden="true">
          <line x1="14" y1="118" x2="118" y2="14" />
          <line x1="22" y1="124" x2="126" y2="20" />
        </g>
      )}
    </svg>
  );
}
