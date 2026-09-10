import {useEffect, useState} from "react";
import {formatUnits, type Address} from "viem";
import {useSession} from "../lib/session";
import {NAIVE, NAIVE_VICTIM_TOKEN_ID, ENVOYAGE, DEMO_MANDATE_ID} from "../lib/config";
import {readMandate} from "../lib/envoyage";
import {explainRevert, sameAddress} from "./revert";
import {
  buildTheftActions,
  stealViaNaive,
  stealViaEnvoyage,
  previewTheftAgainstEnvoyage,
  positionCurrencies,
  erc20Balance,
  ownerOf
} from "../lib/actions";
import {ActionButton, Outcome, Tx, Addr, short, Sponsor, type TxState} from "./kit";

const STEAL = 1_000_000_000_000_000_000n; // 1e18 liquidity per press, so the demo re-runs

/// The story's first and second acts share one set of handlers: the same wallet,
/// playing the bot, sends the same Uniswap instruction — first to the contract that
/// holds an ordinary approval, then to Envoyage. One drains a position; the other
/// mines a failed transaction because the function it targets does not exist.
/// Nothing here is asserted — every outcome is a transaction a judge can open.
export function useTheft() {
  const {account, client} = useSession();
  const [honestState, setHonest] = useState<TxState>({phase: "idle"});
  const [naiveState, setNaive] = useState<TxState>({phase: "idle"});
  const [envState, setEnv] = useState<TxState>({phase: "idle"});
  const [preview, setPreview] = useState<string | null>(null);
  const [victimOwner, setVictimOwner] = useState<Address | null>(null);
  // The bot in this story is the demo mandate's keeper. Both theft presses are
  // gated on that wallet, so "the same bot" is literally the same address.
  const [keeper, setKeeper] = useState<Address | null>(null);

  const thief = account as Address | null;

  useEffect(() => {
    ownerOf(NAIVE_VICTIM_TOKEN_ID).then(setVictimOwner);
    readMandate(DEMO_MANDATE_ID)
      .then((m) => setKeeper(m.keeper === "0x0000000000000000000000000000000000000000" ? null : m.keeper))
      .catch(() => {});
  }, []);

  async function currencies() {
    return positionCurrencies(NAIVE_VICTIM_TOKEN_ID);
  }

  /// The bot doing its job: the same instruction, delivered to the position's owner.
  /// This is what the owner approved the bot for. It is fine.
  async function runNaiveHonest() {
    if (!client || !thief) return;
    const owner = victimOwner ?? (await ownerOf(NAIVE_VICTIM_TOKEN_ID));
    if (!owner) return;
    setHonest({phase: "running", note: "The bot is working for the owner…"});
    try {
      const {currency0, currency1} = await currencies();
      const before = await erc20Balance(currency0, owner);
      const actions = buildTheftActions(NAIVE_VICTIM_TOKEN_ID, currency0, currency1, owner, STEAL);
      const hash = await stealViaNaive(client, NAIVE, NAIVE_VICTIM_TOKEN_ID, actions);
      const after = await erc20Balance(currency0, owner);
      setHonest({
        phase: "done",
        note: (
          <>
            Fine. <b>{formatUnits(after - before, 18)}</b> token0 went to the owner,{" "}
            <Addr addr={owner} />, exactly as intended. <Tx hash={hash}>the transaction</Tx>
          </>
        )
      });
    } catch (e) {
      setHonest({phase: "failed", note: <>Unexpected — the honest run should succeed. {explainRevert(e)}</>});
    }
  }

  /// The bot turning hostile: the identical instruction with one field changed —
  /// the recipient — so the liquidity lands in the bot's own wallet.
  async function runNaive() {
    if (!client || !thief) return;
    setNaive({phase: "running", note: "The bot is withdrawing to itself…"});
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
            Drained. <b>{formatUnits(gained, 18)}</b> token0 moved to <em>your</em> wallet — out of a
            position you never owned. The approval permitted it. <Tx hash={hash}>the transaction</Tx>
          </>
        )
      });
    } catch (e) {
      setNaive({phase: "failed", note: <>Unexpected — the theft should succeed here. {explainRevert(e)}</>});
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
    setEnv({phase: "running", note: "Sending the same theft to Envoyage…"});
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
                  Refused on chain. A real, mined, failed transaction — the same instruction that drained
                  the position in step 1, and no function here to receive it.{" "}
                  <Tx hash={hash}>see it fail on Etherscan</Tx>
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
            point: there is nothing here to call. {explainRevert(e)}
          </>
        )
      });
    }
  }

  const isKeeper = !!thief && !!keeper && sameAddress(thief, keeper);
  const ready = !!client && !!thief && isKeeper;
  return {thief, ready, keeper, isKeeper, victimOwner, honestState, naiveState, envState, preview, runNaiveHonest, runNaive, runPreview, runEnvoyage};
}

export type TheftFlow = ReturnType<typeof useTheft>;

/// Step 1. An ordinary approval, and what it permits.
export function OldWay({t}: {t: TheftFlow}) {
  return (
    <section className="step" aria-labelledby="old-h">
      <header className="step-head">
        <span className="step-no" aria-hidden="true">
          1<small>The old way</small>
        </span>
        <h2 id="old-h">
          An ordinary approval, <em>and what it permits</em>
        </h2>
        <p>
          You called <code className="mono">approve(bot, position)</code>. That tells Uniswap <strong>which</strong>{" "}
          position the bot may touch, and nothing about <strong>what</strong> it may do. Your wallet plays the
          bot here. Position #{NAIVE_VICTIM_TOKEN_ID.toString()} is approved to a contract that does what a bot
          today does: it forwards whatever instruction it is handed.
        </p>
      </header>

      <article className="sheet">
        <div className="docket">
          <span>
            <span className="caps">Approval · unbounded</span> · position #{NAIVE_VICTIM_TOKEN_ID.toString()}
          </span>
          <span>
            approved to <Addr addr={NAIVE} /> · owned by {t.victimOwner ? <Addr addr={t.victimOwner} /> : "…"}
          </span>
        </div>
        <p className="port">execute(uint256 tokenId, bytes actions) — present: the bot decides what happens</p>

        <div className="presses">
          <div className="press">
            <span className="press-label">
              <b>First press.</b> The bot does its job: it moves value out of the position and delivers it to the
              owner. This is what you approved it for.
            </span>
            <ActionButton label="Bot: deliver to the owner" tone="default" state={t.honestState} onClick={t.runNaiveHonest} disabled={!t.ready} />
            <Outcome state={t.honestState} />
          </div>
          <div className="press">
            <span className="press-label">
              <b>Second press.</b> The same bot, the same instruction, one field changed: the recipient is now
              the bot. This is the attack that drained Aperture Finance.
            </span>
            <ActionButton label="Bot: withdraw everything to itself" tone="hostile" state={t.naiveState} onClick={t.runNaive} disabled={!t.ready} />
            <Outcome state={t.naiveState} />
          </div>
        </div>
        {!t.ready && <TheftGate t={t} />}
      </article>
    </section>
  );
}

/// Step 2, right-hand side. The same theft, sent to Envoyage instead.
export function MandateTheft({t}: {t: TheftFlow}) {
  return (
    <article className="sheet duel-side">
      <div className="docket">
        <span className="caps">Same bot · same instruction</span>
        <span>to <Addr addr={ENVOYAGE} /></span>
      </div>
      <h3>
        The bot tries the theft again
        <span className="tag">There is no function that takes an instruction. The transaction mines, and fails.</span>
      </h3>
      <p className="duel-sub">
        Byte for byte the calldata from step 1, second press, addressed to Envoyage ({short(ENVOYAGE)}) instead
        of the approved contract.
      </p>
      <p className="port absent">execute(uint256 tokenId, bytes actions) — absent</p>
      <div className="duel-actions">
        <button className="act act-ghost" onClick={t.runPreview} disabled={!t.thief}>
          Check the ABI first
        </button>
        <ActionButton label="Bot: send the same theft to Envoyage" tone="hostile" state={t.envState} onClick={t.runEnvoyage} disabled={!t.ready} />
      </div>
      {t.preview && <p className="preview mono">{t.preview}</p>}
      {!t.ready && <TheftGate t={t} />}
      <Outcome state={t.envState} />
      <p className="foot-note" style={{fontSize: 14}}>
        <Sponsor name="Uniswap" /> The instruction is a real v4 action list — <code className="mono">DECREASE_LIQUIDITY</code>{" "}
        then <code className="mono">TAKE_PAIR</code> — the same bytes the PositionManager executed a moment ago.
      </p>
    </article>
  );
}

/// Who is needed for the theft presses: the bot, i.e. the mandate's keeper wallet.
function TheftGate({t}: {t: TheftFlow}) {
  return (
    <p className="gate" role="status" style={{marginTop: 16}}>
      {t.thief ? "Wrong wallet. " : "No wallet connected. "}
      Switch to the keeper wallet <span className="mono">{t.keeper ? short(t.keeper) : "…"}</span> — the bot.
    </p>
  );
}
