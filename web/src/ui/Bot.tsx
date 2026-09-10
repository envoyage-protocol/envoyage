import {useEffect, useState} from "react";
import {formatUnits, type Address, type Hex} from "viem";
import {useSession} from "../lib/session";
import {fetchMandatesByKeeper, type AppMandate} from "../lib/graph";
import {readMandate, type Mandate} from "../lib/envoyage";
import {preflight, positionLiquidity, type Preflight} from "../lib/actions";
import {explainRevert, revertSelector, sameAddress} from "./revert";
import {useCompound} from "./useCompound";
import {ActionButton, Tx, Sponsor, short} from "./kit";

const ZERO = "0x0000000000000000000000000000000000000000";

function BotRow({row}: {row: AppMandate}) {
  const {client, account, onSepolia} = useSession();
  const id = BigInt(row.mandateId);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [liq, setLiq] = useState<bigint | null>(null);
  const [pre, setPre] = useState<Preflight | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setPre(null);
    try {
      const m = await readMandate(id);
      setMandate(m);
      if (m.keeper === ZERO) return;
      const [p, l] = await Promise.all([
        preflight(id, m.keeper, m, (e, ctx) => explainRevert(e, ctx), (e) => revertSelector(e).name),
        positionLiquidity(m.tokenId).catch(() => null)
      ]);
      setPre(p);
      setLiq(l);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.mandateId]);

  const {state, run} = useCompound(client, id, mandate, load);
  const isKeeper = !!account && !!mandate && mandate.keeper !== ZERO && sameAddress(account, mandate.keeper);
  const revoked = mandate !== null && mandate.keeper === ZERO;
  const canPress = isKeeper && pre?.verdict === "may act" && onSepolia && !!client;

  return (
    <article className="sheet" data-state={revoked ? "revoked" : "in-force"} aria-label={`Mandate ${row.mandateId}`}>
      <div className="docket">
        <span>
          <span className="caps">Mandate No. {row.mandateId}</span> · position #{row.position.id} <Sponsor name="Uniswap" />
        </span>
        <span>{revoked ? "revoked" : `owner ${short(row.grantor)} · cap ${(row.maxFeeBps / 100).toFixed(2)}%`}</span>
      </div>
      <div className="row-grid">
        <div>
          <span className="label">Position liquidity</span>
          <span className="value num">{liq === null ? "…" : Number(formatUnits(liq, 18)).toFixed(6)}</span>
        </div>
        <div>
          <span className="label">Executions</span>
          <span className="value num">{row.executionCount}</span>
          <small>indexed <Sponsor name="The Graph" /></small>
        </div>
        <div>
          <span className="label">Cooldown</span>
          <span className="value num">{row.minInterval}s</span>
        </div>
      </div>

      <div className="report" role="status">
        <div className="report-head">
          <span className="caps">Pre-flight</span>
        </div>
        {err ? (
          <p className="line gate-refused">
            Could not read: {err}{" "}
            <button className="act act-ghost sm" onClick={load}>
              Retry
            </button>
          </p>
        ) : revoked ? (
          <p className="line">This mandate is revoked. There is nothing to do.</p>
        ) : pre === null ? (
          <p className="line waiting">reading canCompound() and simulating compound() from your account…</p>
        ) : (
          <p className="line">
            <b>{pre.verdict === "may act" ? "May act." : pre.verdict === "no fees yet" ? "No fees yet." : "Refused."}</b> {pre.sentence}
          </p>
        )}
      </div>

      <div className="row-actions">
        <div>
          <ActionButton label="Compound" tone="primary" state={state} onClick={run} disabled={!canPress || state.phase === "running"} />
          {state.phase === "done" && (
            <p className="outcome outcome-ok" role="status">
              <span aria-hidden="true">✓</span>
              <span>
                Compounded. <Tx hash={state.note as Hex}>transaction</Tx>
              </span>
            </p>
          )}
          {state.phase === "failed" && (
            <p className="outcome outcome-bad" role="status">
              <span aria-hidden="true">✕</span>
              <span>{state.note}</span>
            </p>
          )}
          {!isKeeper && mandate && !revoked && (
            <p className="gate">
              Switch to the keeper wallet <span className="mono">{short(mandate.keeper)}</span> to compound.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/// The keeper's screen. Rows are the mandates naming the connected wallet as
/// keeper; a wallet no mandate names sees one explanatory panel and nothing else.
export function Bot() {
  const {account} = useSession();
  const [rows, setRows] = useState<AppMandate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!account) return;
    setRows(null);
    setError(null);
    fetchMandatesByKeeper(account)
      .then((d) => setRows(d.mandates))
      .catch((e) => setError(e instanceof Error ? e.message.split("\n")[0] : String(e)));
  }, [account, tick]);

  return (
    <section className="exhibit" aria-labelledby="bot-h">
      <div className="exhibit-head">
        <span className="caps">Bot</span>
        <h2 id="bot-h">What this wallet may do, right now</h2>
        <p>
          Mandates naming <span className="mono">{short(account as Address)}</span> as keeper, from the subgraph — the same task list the
          reference bot reads. Each shows the contract's gate plus a simulated compound, so the answer includes "no fees yet".
        </p>
      </div>

      {rows === null && !error && <p className="pending">Loading the task list from the subgraph…</p>}
      {error && (
        <div className="error" role="alert">
          <b>Subgraph query failed.</b>
          <span>
            <code>{error}</code>{" "}
            <button className="act act-ghost sm" onClick={() => setTick((t) => t + 1)}>
              Retry
            </button>
          </span>
        </div>
      )}
      {rows !== null && rows.length === 0 && (
        <article className="sheet">
          <h3 className="instrument-title" style={{fontSize: 26}}>
            No mandate names this wallet as keeper
          </h3>
          <p className="instrument-sub">
            A bot only exists here once an owner grants it a mandate. Envoyage's reference bot is the keeper of every mandate hired from this app;
            connect its wallet to see the task list, or hire it from an owner wallet and watch it work in My mandates.
          </p>
        </article>
      )}
      {rows !== null && rows.length > 0 && (
        <div className="rows">
          {rows.map((r) => (
            <BotRow key={r.mandateId} row={r} />
          ))}
        </div>
      )}
    </section>
  );
}
