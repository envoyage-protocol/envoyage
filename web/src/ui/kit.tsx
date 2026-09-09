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
