import {useCallback, useEffect, useRef, useState} from "react";
import type {Address, Hex} from "viem";
import {Tx} from "./kit";
import {explainRevert} from "./revert";

/// One transaction in an ordered sequence. `isDone` lets the runner resume: a
/// step that is already satisfied on chain (approval present, mandate granted) is
/// marked done and skipped, never re-sent.
export type Step = {
  id: string;
  label: string;
  isDone: () => Promise<boolean>;
  run: () => Promise<Hex | void>;
};

export type StepStatus =
  | {phase: "idle"}
  | {phase: "skipped"}
  | {phase: "running"}
  | {phase: "done"; hash?: Hex}
  | {phase: "failed"; error: string};

export type RunnerState = {
  statuses: StepStatus[];
  running: boolean;
  /// true once every step is done or skipped
  complete: boolean;
  halted: string | null;
  start: () => Promise<void>;
  retry: (i: number) => Promise<void>;
};

/// The shared multi-step transaction model: run from the first not-done step,
/// stop on the first failure with its decoded reason, Retry re-runs exactly that
/// step, and an account change mid-sequence halts everything rather than sending
/// the next step from the wrong wallet.
export function useStepRunner(
  steps: Step[],
  opts: {account: Address | null; explain?: (e: unknown) => string; onComplete?: () => void}
): RunnerState {
  const [statuses, setStatuses] = useState<StepStatus[]>(() => steps.map(() => ({phase: "idle"})));
  const [running, setRunning] = useState(false);
  const [halted, setHalted] = useState<string | null>(null);
  const accountRef = useRef(opts.account);
  const startedWith = useRef<Address | null>(null);
  const explain = opts.explain ?? ((e: unknown) => explainRevert(e));

  useEffect(() => {
    accountRef.current = opts.account;
  }, [opts.account]);

  // A new step list (different position selected) resets the rows.
  const key = steps.map((s) => s.id).join("|");
  useEffect(() => {
    setStatuses(steps.map(() => ({phase: "idle"})));
    setHalted(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (i: number, st: StepStatus) =>
    setStatuses((prev) => prev.map((s, j) => (j === i ? st : s)));

  const runFrom = useCallback(
    async (from: number, only: boolean, startedAs: Address | null): Promise<"ok" | "failed" | "halted"> => {
      setRunning(true);
      setHalted(null);
      startedWith.current = startedAs;
      try {
        for (let i = from; i < steps.length; i++) {
          if (accountRef.current !== startedWith.current) {
            setHalted("The wallet account changed mid-sequence. Reconnect with the account that started it to resume.");
            return "halted";
          }
          const step = steps[i];
          let done = false;
          try {
            done = await step.isDone();
          } catch {
            done = false;
          }
          if (done) {
            set(i, {phase: "skipped"});
            if (only) return "ok";
            continue;
          }
          set(i, {phase: "running"});
          try {
            const hash = await step.run();
            set(i, {phase: "done", hash: hash ?? undefined});
          } catch (e) {
            set(i, {phase: "failed", error: explain(e)});
            return "failed";
          }
          if (only) return "ok";
        }
        opts.onComplete?.();
        return "ok";
      } finally {
        setRunning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, opts.onComplete]
  );

  const start = useCallback(async () => {
    // The account that pressed Start, captured before any await.
    const startedAs = accountRef.current;
    // Resume: everything before the first not-done step is marked as satisfied.
    let from = 0;
    const pre: StepStatus[] = [];
    for (; from < steps.length; from++) {
      let done = false;
      try {
        done = await steps[from].isDone();
      } catch {
        done = false;
      }
      if (!done) break;
      pre.push({phase: "skipped"});
    }
    setStatuses((prev) => prev.map((s, j) => (j < from ? pre[j] : s.phase === "failed" ? {phase: "idle"} : s)));
    await runFrom(from, false, startedAs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runFrom, key]);

  const retry = useCallback(
    async (i: number) => {
      // If the retried step landed, continue with what follows.
      const startedAs = accountRef.current;
      const r = await runFrom(i, true, startedAs);
      if (r !== "ok") return;
      if (i + 1 < steps.length) await runFrom(i + 1, false, startedAs);
      else opts.onComplete?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runFrom, key]
  );

  const complete = statuses.length > 0 && statuses.every((s) => s.phase === "done" || s.phase === "skipped");
  return {statuses, running, complete, halted, start, retry};
}

/// One row per step, with its state as the label: pending / signed / failed +
/// Retry. Completions are announced through a polite live region.
export function StepRunner({steps, state}: {steps: Step[]; state: RunnerState}) {
  const doneCount = state.statuses.filter((s) => s.phase === "done" || s.phase === "skipped").length;
  return (
    <div className="steps">
      <ol className="step-list">
        {steps.map((step, i) => {
          const st = state.statuses[i] ?? {phase: "idle"};
          return (
            <li key={step.id} className={`step-row ${st.phase}`} data-phase={st.phase}>
              <span className="step-mark" aria-hidden="true">
                {st.phase === "done" || st.phase === "skipped" ? "✓" : st.phase === "failed" ? "✕" : st.phase === "running" ? "…" : i + 1}
              </span>
              <span className="step-body">
                <span className="step-label">{step.label}</span>
                <span className="step-state">
                  {st.phase === "idle" && "not yet"}
                  {st.phase === "skipped" && "already satisfied — skipped"}
                  {st.phase === "running" && "waiting for your signature, then the chain…"}
                  {st.phase === "done" && (
                    <>
                      signed and mined{st.hash ? <> · <Tx hash={st.hash}>transaction</Tx></> : null}
                    </>
                  )}
                  {st.phase === "failed" && <span className="step-error">{st.error}</span>}
                </span>
              </span>
              {st.phase === "failed" && !state.running && (
                <button className="act act-ghost sm" onClick={() => state.retry(i)}>
                  Retry this step
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {state.halted && (
        <p className="outcome outcome-bad" role="status">
          <span aria-hidden="true">✕</span>
          <span>{state.halted}</span>
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {doneCount} of {steps.length} steps complete
        {state.complete ? ". All steps complete." : ""}
      </p>
    </div>
  );
}
