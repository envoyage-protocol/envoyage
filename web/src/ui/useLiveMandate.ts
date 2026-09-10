import {useEffect, useRef, useState} from "react";
import {fetchMandate, type AppMandate, type Execution} from "../lib/graph";

export type Live = {
  mandate: AppMandate | null;
  executions: Execution[];
  indexedBlock: number | null;
  error: string | null;
  /// set when a poll observed the change it was waiting for
  observed: null | {kind: "compounded"; block: string; count: number} | {kind: "revoked"};
  polling: boolean;
  refetch: () => void;
};

/// Polls the subgraph for one mandate while there is something to wait for — an
/// expected first compound, or a revoke in flight — and stops the moment the count
/// rises or the status flips. Never renders a stale count as current: `observed`
/// is set only from a poll that saw the change.
export function useLiveMandate(
  id: bigint,
  expect: null | {kind: "compound"; sinceCount: number} | {kind: "revoke"},
  pollMs = 5000,
  maxMs = 15 * 60 * 1000
): Live {
  const [state, setState] = useState<Omit<Live, "refetch">>({
    mandate: null,
    executions: [],
    indexedBlock: null,
    error: null,
    observed: null,
    polling: false
  });
  const [tick, setTick] = useState(0);
  const stop = useRef(false);

  useEffect(() => {
    stop.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();
    const once = async () => {
      try {
        const d = await fetchMandate(id);
        if (stop.current) return;
        let observed: Live["observed"] = null;
        if (expect?.kind === "compound" && d.mandate && d.mandate.executionCount > expect.sinceCount) {
          observed = {kind: "compounded", block: d.executions[0]?.block ?? String(d.indexedBlock), count: d.mandate.executionCount};
        }
        if (expect?.kind === "revoke" && d.mandate?.status === "REVOKED") observed = {kind: "revoked"};
        setState((s) => ({...s, mandate: d.mandate, executions: d.executions, indexedBlock: d.indexedBlock, error: null, observed: observed ?? s.observed}));
        const keepGoing = !!expect && !observed && Date.now() - started < maxMs;
        setState((s) => ({...s, polling: keepGoing}));
        if (keepGoing) timer = setTimeout(once, pollMs);
      } catch (e) {
        if (stop.current) return;
        setState((s) => ({...s, error: e instanceof Error ? e.message.split("\n")[0] : String(e), polling: false}));
      }
    };
    setState((s) => ({...s, polling: !!expect}));
    once();
    return () => {
      stop.current = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id.toString(), expect?.kind, expect && "sinceCount" in expect ? expect.sinceCount : 0, tick, pollMs]);

  return {...state, refetch: () => setTick((t) => t + 1)};
}
