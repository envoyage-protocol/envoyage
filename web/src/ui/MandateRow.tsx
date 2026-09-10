import {useEffect, useState} from "react";
import {formatUnits, type Address, type Hex} from "viem";
import {useSession} from "../lib/session";
import {ENS_PARENT, FIRST_COMPOUND_BOUND_S, EXPLORER} from "../lib/config";
import {readMandate, readNameOwner, type Mandate} from "../lib/envoyage";
import {revoke, publishName, retireName, preflight, type Preflight} from "../lib/actions";
import type {AppMandate} from "../lib/graph";
import {useLiveMandate} from "./useLiveMandate";
import {explainRevert, revertSelector, sameAddress} from "./revert";
import {ActionButton, Outcome, Tx, Sponsor, short, type TxState} from "./kit";

const ZERO = "0x0000000000000000000000000000000000000000";
const fmtDate = (t: string | bigint | null) => (!t || t === "0" ? "—" : new Date(Number(t) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC");

/// One mandate the connected wallet granted. The subgraph row is the spine; chain
/// reads (readMandate, preflight, the name's owner) load independently so a
/// stalled indexer never blanks the row. Polls while a first compound is expected
/// or a revoke is in flight.
export function MandateRow({row, pollMs = 5000, go}: {row: AppMandate; pollMs?: number; go: (r: string) => void}) {
  const {client, account, onSepolia} = useSession();
  const id = BigInt(row.mandateId);

  const [chain, setChain] = useState<Mandate | null>(null);
  const [chainErr, setChainErr] = useState<string | null>(null);
  const [pre, setPre] = useState<Preflight | null>(null);
  const [preErr, setPreErr] = useState<string | null>(null);
  const [nameOwner, setNameOwner] = useState<Address | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [revState, setRev] = useState<TxState>({phase: "idle"});
  const [revokeHash, setRevokeHash] = useState<Hex | null>(null);
  const [nameState, setName] = useState<TxState>({phase: "idle"});
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const isGrantor = !!account && sameAddress(account, row.grantor);
  const revokedOnChain = chain !== null && chain.keeper === ZERO;

  async function loadChain() {
    setChainErr(null);
    try {
      const m = await readMandate(id);
      setChain(m);
      if (m.keeper !== ZERO) {
        preflight(id, m.keeper, m, (e, ctx) => explainRevert(e, ctx), (e) => revertSelector(e).name)
          .then(setPre)
          .catch((e) => setPreErr(e instanceof Error ? e.message.split("\n")[0] : String(e)));
      }
    } catch (e) {
      setChainErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }
  async function loadName() {
    readNameOwner(BigInt(row.position.id)).then(setNameOwner).catch(() => setNameOwner(null));
  }
  useEffect(() => {
    loadChain();
    loadName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.mandateId]);

  // Expectation drives polling: a fresh mandate with no executions, or a revoke sent.
  const fresh = row.status === "ACTIVE" && row.executionCount === 0 && now - Number(row.grantedAt) < 2 * FIRST_COMPOUND_BOUND_S + 15 * 60;
  const expectation = revokeHash ? ({kind: "revoke"} as const) : fresh ? ({kind: "compound", sinceCount: row.executionCount} as const) : null;
  const live = useLiveMandate(id, expectation, pollMs);
  const current = live.mandate ?? row;
  const status: "ACTIVE" | "REVOKED" = revokedOnChain ? "REVOKED" : (current.status as "ACTIVE" | "REVOKED");

  useEffect(() => {
    if (!expectation) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [expectation?.kind]);

  useEffect(() => {
    if (live.observed) {
      loadChain();
      loadName();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.observed]);

  async function runRevoke() {
    if (!client) return;
    setConfirming(false);
    setRev({phase: "running", note: "Revoking…"});
    try {
      const hash = await revoke(client, id);
      setRevokeHash(hash);
      setRev({phase: "done", note: <>Revoked on chain. <Tx hash={hash}>transaction</Tx></>});
      loadChain();
    } catch (e) {
      setRev({phase: "failed", note: <>{explainRevert(e, {mandate: chain})}</>});
    }
  }
  async function runPublish() {
    if (!client) return;
    setName({phase: "running", note: "Publishing the name…"});
    try {
      const hash = await publishName(client, id);
      setName({phase: "done", note: <>Published {row.position.id}.{ENS_PARENT}. <Tx hash={hash}>transaction</Tx></>});
      loadName();
    } catch (e) {
      setName({phase: "failed", note: <>{explainRevert(e)}</>});
    }
  }
  async function runRetire() {
    if (!client) return;
    setName({phase: "running", note: "Retiring the name…"});
    try {
      const hash = await retireName(client, id, BigInt(row.position.id));
      setName({phase: "done", note: <>Name retired; the record is gone. <Tx hash={hash}>transaction</Tx></>});
      loadName();
    } catch (e) {
      setName({phase: "failed", note: <>{explainRevert(e)}</>});
    }
  }

  const name = `${row.position.id}.${ENS_PARENT}`;
  const hasName = nameOwner !== null && nameOwner !== ZERO;
  const expectedBy = Number(row.grantedAt) + FIRST_COMPOUND_BOUND_S;
  const remaining = expectedBy - now;

  return (
    <article className="sheet mandate-row" data-state={status === "REVOKED" ? "revoked" : "in-force"} aria-label={`Mandate ${row.mandateId}`}>
      <div className="docket">
        <span>
          <span className="caps">Mandate No. {row.mandateId}</span> · position #{row.position.id} <Sponsor name="Uniswap" />
        </span>
        <span className={`status status-${status.toLowerCase()}`}>{status === "ACTIVE" ? "active" : "revoked"}</span>
      </div>

      <div className="row-grid">
        <div>
          <span className="label">Keeper</span>
          <span className="value mono">{short(row.keeper.id)}</span>
        </div>
        <div>
          <span className="label">Fee cap</span>
          <span className="value num">{(row.maxFeeBps / 100).toFixed(2)}%</span>
        </div>
        <div>
          <span className="label">Executions</span>
          <span className="value num">{current.executionCount}</span>
          <small>indexed by the subgraph <Sponsor name="The Graph" /></small>
        </div>
        <div>
          <span className="label">Last execution</span>
          <span className="value num" style={{fontSize: 16}}>{fmtDate(current.lastExecutedAt)}</span>
        </div>
        <div>
          <span className="label">Liquidity added by the bot</span>
          <span className="value num">+{Number(formatUnits(BigInt(current.totalLiquidityAdded), 18)).toFixed(6)}</span>
        </div>
        <div>
          <span className="label">ENS name</span>
          <span className="value" style={{fontSize: 16}}>
            {nameOwner === null ? <span className="pending">resolving…</span> : hasName ? <>{name} <Sponsor name="ENS" /></> : <span className="pending">not published</span>}
          </span>
        </div>
      </div>

      {/* chain-side state, independent of the subgraph */}
      {chainErr && (
        <p className="gate gate-refused">
          Could not read the contract: {chainErr}{" "}
          <button className="act act-ghost sm" onClick={loadChain}>
            Retry
          </button>
        </p>
      )}
      {live.error && (
        <p className="gate gate-refused">
          Subgraph read failed: {live.error}{" "}
          <button className="act act-ghost sm" onClick={live.refetch}>
            Retry
          </button>
        </p>
      )}

      {/* the live indicator */}
      {status === "ACTIVE" && (
        <div className="report" role="status" aria-live="polite">
          <div className="report-head">
            <span className="caps">Right now</span>
            {live.polling && <span className="pending">watching the indexer…</span>}
          </div>
          {live.observed?.kind === "compounded" && (
            <p className="line">
              <b>Compounded</b> — indexed at block <span className="num">{live.observed.block}</span>, execution {live.observed.count}. Nothing was pressed.
            </p>
          )}
          {!live.observed && current.executionCount === 0 && (
            <p className="line">
              <b>Waiting for the bot.</b>{" "}
              {remaining > 0
                ? <>First compound expected within ~{Math.ceil(remaining / 60)} min.</>
                : <>The expected window ({Math.round(FIRST_COMPOUND_BOUND_S / 60)} min) has passed; the reason below says why.</>}
            </p>
          )}
          <p className="line" style={{fontSize: 15}}>
            {preErr ? (
              <span className="gate-refused">
                Pre-flight failed: {preErr}{" "}
                <button className="act act-ghost sm" onClick={loadChain}>
                  Retry
                </button>
              </span>
            ) : pre ? (
              <>
                {pre.verdict === "may act" ? "Fees are waiting; the bot may compound now." : pre.sentence}
              </>
            ) : (
              <span className="pending">reading the pre-flight…</span>
            )}
          </p>
        </div>
      )}

      {/* actions */}
      <div className="row-actions">
        {status === "ACTIVE" && !revokeHash && (
          <div>
            {!confirming ? (
              <ActionButton label="Revoke" tone="hostile" state={revState} onClick={() => setConfirming(true)} disabled={!client || !isGrantor || !onSepolia} />
            ) : (
              <span className="confirm">
                This ends mandate No. {row.mandateId}. Its name keeps resolving as a historical record. Revoke?{" "}
                <button className="act sm" onClick={runRevoke}>
                  Yes, revoke
                </button>{" "}
                <button className="act act-ghost sm" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </span>
            )}
            {!isGrantor && (
              <p className="gate" role="status">
                {account ? "Wrong wallet. " : ""}Switch to the owner wallet <span className="mono">{short(row.grantor)}</span> to revoke.
              </p>
            )}
            <Outcome state={revState} />
          </div>
        )}
        {revokeHash && status !== "REVOKED" && (
          <p className="gate">
            revoking — <Tx hash={revokeHash}>tx {short(revokeHash)}</Tx> · waiting for the subgraph to reflect it…
          </p>
        )}
        {status === "REVOKED" && (
          <p className="gate">
            Revoked{row.revokedTx ? <> · <a className="mono" href={`${EXPLORER}/tx/${row.revokedTx}`} target="_blank" rel="noreferrer">transaction</a></> : null}.{" "}
            {hasName ? <>The name <b>{name}</b> still resolves, as a record of what was permitted.</> : "Its name has been retired."}
          </p>
        )}
        {status === "ACTIVE" && nameOwner !== null && !hasName && (
          <div>
            <ActionButton label="Publish name" tone="default" state={nameState} onClick={runPublish} disabled={!client || !onSepolia} />
            <p className="gate">Permissionless: anyone may publish a live mandate's scope as {name}.</p>
          </div>
        )}
        {status === "REVOKED" && hasName && (
          <div>
            <ActionButton label="Retire name" tone="default" state={nameState} onClick={runRetire} disabled={!client || !onSepolia} />
            <p className="gate">Optional. The chain only allows this once the mandate is revoked.</p>
          </div>
        )}
        <Outcome state={nameState} />
        <button className="act act-ghost sm" onClick={() => go(`lookup/${row.mandateId}`)}>
          Look it up
        </button>
      </div>
    </article>
  );
}
