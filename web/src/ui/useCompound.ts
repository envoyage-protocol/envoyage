import {useState} from "react";
import type {WalletClient} from "viem";
import {compound} from "../lib/actions";
import type {Mandate} from "../lib/envoyage";
import {explainRevert} from "./revert";
import type {TxState} from "./kit";

/// One compound press with its lifecycle: running → done (hash) | failed (decoded
/// sentence). Shared by the Bot screen; the Proof tab keeps its own richer handler.
export function useCompound(client: WalletClient | null, mandateId: bigint, mandate: Mandate | null, onDone?: () => void) {
  const [state, setState] = useState<TxState>({phase: "idle"});
  async function run() {
    if (!client) return;
    setState({phase: "running", note: "Compounding…"});
    try {
      const hash = await compound(client, mandateId);
      setState({phase: "done", note: hash});
      onDone?.();
    } catch (e) {
      setState({phase: "failed", note: explainRevert(e, {mandate})});
    }
  }
  return {state, run, reset: () => setState({phase: "idle"})};
}
