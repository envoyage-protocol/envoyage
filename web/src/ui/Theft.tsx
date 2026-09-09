import {useState} from "react";
import {formatUnits, type Address} from "viem";
import {useSession} from "../lib/session";
import {NAIVE, NAIVE_VICTIM_TOKEN_ID, ENVOYAGE} from "../lib/config";
import {
  buildTheftActions,
  stealViaNaive,
  stealViaEnvoyage,
  previewTheftAgainstEnvoyage,
  positionCurrencies,
  erc20Balance
} from "../lib/actions";
import {ActionButton, Outcome, Tx, Addr, type TxState} from "./kit";

const STEAL = 1_000_000_000_000_000_000n; // 1e18 liquidity per press, so the demo re-runs

/// The centrepiece. Same wallet, same calldata, two contracts. One drains a
/// position; the other mines a failed transaction because the function it targets
/// does not exist. Nothing here is asserted — both outcomes are transactions a
/// judge can open on Etherscan.
export function Theft() {
  const {account, client} = useSession();
  const [naiveState, setNaive] = useState<TxState>({phase: "idle"});
  const [envState, setEnv] = useState<TxState>({phase: "idle"});
  const [preview, setPreview] = useState<string | null>(null);

  const thief = account as Address | null;

  async function currencies() {
    return positionCurrencies(NAIVE_VICTIM_TOKEN_ID);
  }

  async function runNaive() {
    if (!client || !thief) return;
    setNaive({phase: "running", note: "Sending theft to the naive contract…"});
    try {
      const {currency0, currency1} = await currencies();
      const before = await erc20Balance(currency0, thief);
      const actions = buildTheftActions(NAIVE_VICTIM_TOKEN_ID, currency0, currency1, thief, STEAL);
      const hash = await stealViaNaive(client, NAIVE, NAIVE_VICTIM_TOKEN_ID, actions);
      const after = await erc20Balance(currency0, thief);
      const gained = after - before;
      setNaive({
        phase: "done",
        note: (
          <>
            Drained. <b>{formatUnits(gained, 18)}</b> token0 moved to your wallet — a position you
            never owned. <Tx hash={hash}>the transaction</Tx>
          </>
        )
      });
    } catch (e) {
      setNaive({phase: "failed", note: <>Unexpected — the naive theft should succeed. {String(e).slice(0, 120)}</>});
    }
  }

  async function runPreview() {
    if (!thief) return;
    const {currency0, currency1} = await currencies();
    const actions = buildTheftActions(NAIVE_VICTIM_TOKEN_ID, currency0, currency1, thief, STEAL);
    const r = await previewTheftAgainstEnvoyage(NAIVE_VICTIM_TOKEN_ID, actions, thief);
    setPreview(
      r.existsOnAbi
        ? `Envoyage exposes execute(uint256,bytes) — selector ${r.selector}. Unexpected.`
        : `Envoyage has no function with selector ${r.selector}. The call ${r.reverted ? "reverts before any code runs" : "did not revert (unexpected)"}.`
    );
  }

  async function runEnvoyage() {
    if (!client || !thief) return;
    setEnv({phase: "running", note: "Sending the same calldata to Envoyage…"});
    try {
      const {currency0, currency1} = await currencies();
      const actions = buildTheftActions(NAIVE_VICTIM_TOKEN_ID, currency0, currency1, thief, STEAL);
      const {hash, status} = await stealViaEnvoyage(client, NAIVE_VICTIM_TOKEN_ID, actions);
      setEnv(
        status === "reverted"
          ? {
              phase: "done", // the FAILURE is the success here
              note: (
                <>
                  Reverted on chain. A real, mined, failed transaction — same calldata as the theft on
                  the left, no function to receive it. <Tx hash={hash}>see it fail on Etherscan</Tx>
                </>
              )
            }
          : {phase: "failed", note: <>The call unexpectedly succeeded. <Tx hash={hash}>inspect</Tx></>}
      );
    } catch (e) {
      // The wallet refused to send a tx it predicts will fail. Fall back to naming it.
      setEnv({
        phase: "failed",
        note: (
          <>
            Your wallet refused to submit a transaction it predicts will fail — which is itself the
            point: there is nothing here to call. {String(e).slice(0, 100)}
          </>
        )
      });
    }
  }

  const ready = !!client && !!thief;

  return (
    <section className="act-panel" aria-labelledby="theft-h">
      <header className="act-head">
        <span className="act-role hostile">The keeper turns hostile</span>
        <h2 id="theft-h">The same attack, against two contracts</h2>
        <p>
          This is the attack that drained Aperture Finance: the holder of an approval assembles a
          Uniswap instruction to pull the liquidity out and send it to itself. You send the{" "}
          <strong>identical calldata</strong> to two contracts. The only difference is which one
          receives it.
        </p>
      </header>

      <div className="duel">
        <div className="duel-side hostile-side">
          <h3>NaiveUtils <span className="tag">approved, unbounded</span></h3>
          <p className="duel-sub">
            Position <Addr addr={String(NAIVE_VICTIM_TOKEN_ID)} kind="token" /> #{NAIVE_VICTIM_TOKEN_ID.toString()} is
            approved to <Addr addr={NAIVE} />, exactly as automation contracts ask today. It accepts
            whatever instruction you hand it.
          </p>
          <ActionButton label="Withdraw the liquidity to my wallet" tone="hostile" state={naiveState} onClick={runNaive} disabled={!ready} />
          <Outcome state={naiveState} />
        </div>

        <div className="duel-side safe-side">
          <h3>Envoyage <span className="tag">mandate</span></h3>
          <p className="duel-sub">
            The keeper holds a mandate over <Addr addr={ENVOYAGE} />. You send the same calldata. There
            is no <code>execute(bytes)</code> — the contract writes its own instructions.
          </p>
          <div className="duel-actions">
            <button className="act act-ghost" onClick={runPreview} disabled={!thief}>
              Check the ABI first
            </button>
            <ActionButton label="Send the same theft to Envoyage" tone="default" state={envState} onClick={runEnvoyage} disabled={!ready} />
          </div>
          {preview && <p className="preview mono">{preview}</p>}
          <Outcome state={envState} />
        </div>
      </div>

      {!ready && <p className="pending">Connect a wallet to run both, from the same account.</p>}
    </section>
  );
}
