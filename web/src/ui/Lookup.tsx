import {useEffect, useState} from "react";
import {formatUnits, type Address} from "viem";
import {ENS_PARENT, KEEPER_KEY, DEMO_MANDATE_ID, EXPLORER, REFERENCE_KEEPER} from "../lib/config";
import {readEnsScope, readMandate} from "../lib/envoyage";
import {fetchMandate, fetchMandatesByPosition, type AppMandate, type Execution} from "../lib/graph";
import {parseLookup, type LookupTarget} from "../lib/lookup";
import {MandatePreview} from "./MandatePreview";
import {Sponsor, short} from "./kit";

const ZERO = "0x0000000000000000000000000000000000000000";

type Resolver =
  | {state: "pending"}
  | {state: "error"; error: string}
  | {state: "not-found"; name: string}
  | {state: "ok"; name: string; node: string; records: Record<string, string>};

type Graph =
  | {state: "pending"}
  | {state: "error"; error: string}
  | {state: "not-indexed"}
  | {state: "ok"; mandate: AppMandate; executions: Execution[]; indexedBlock: number};

/// Name or number → the scope as the ENS resolver returns it, beside the
/// mandate's status and executions from the subgraph. The two load
/// independently, and a revoked status puts a banner on the resolver card:
/// ENS records survive revoke by design, so without the status a revoked scope
/// would read as live.
export function Lookup({initial}: {initial?: string}) {
  const [input, setInput] = useState(initial ?? "");
  const [target, setTarget] = useState<LookupTarget | null>(null);
  const [resolver, setResolver] = useState<Resolver>({state: "pending"});
  const [graph, setGraph] = useState<Graph>({state: "pending"});
  const [tick, setTick] = useState(0);

  function submit(raw = input) {
    const t = parseLookup(raw);
    setTarget(t);
    setTick((x) => x + 1);
  }
  useEffect(() => {
    if (initial) submit(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    if (!target || target.kind === "invalid") return;
    let cancelled = false;
    setResolver({state: "pending"});
    setGraph({state: "pending"});

    const loadResolver = async (positionId: bigint) => {
      const name = `${positionId}.${ENS_PARENT}`;
      try {
        const s = await readEnsScope(positionId);
        if (cancelled) return;
        const any = Object.values(s.records).some((v) => v !== "");
        setResolver(any ? {state: "ok", name, node: s.node, records: s.records} : {state: "not-found", name});
      } catch (e) {
        if (!cancelled) setResolver({state: "error", error: e instanceof Error ? e.message.split("\n")[0] : String(e)});
      }
    };
    const loadGraphById = async (id: bigint) => {
      try {
        const d = await fetchMandate(id);
        if (cancelled) return;
        setGraph(d.mandate ? {state: "ok", mandate: d.mandate, executions: d.executions, indexedBlock: d.indexedBlock} : {state: "not-indexed"});
        return d.mandate;
      } catch (e) {
        if (!cancelled) setGraph({state: "error", error: e instanceof Error ? e.message.split("\n")[0] : String(e)});
        return null;
      }
    };

    if (target.kind === "position") {
      loadResolver(target.id);
      fetchMandatesByPosition(target.id)
        .then((d) => {
          if (cancelled) return;
          const m = d.mandates[0];
          if (!m) setGraph({state: "not-indexed"});
          else loadGraphById(BigInt(m.mandateId));
        })
        .catch((e) => !cancelled && setGraph({state: "error", error: e instanceof Error ? e.message.split("\n")[0] : String(e)}));
    } else {
      // A number: the position comes from the contract while the mandate is live,
      // and from the subgraph once revoke has deleted the storage.
      (async () => {
        let positionId: bigint | null = null;
        try {
          const m = await readMandate(target.id);
          if (m.keeper !== ZERO) positionId = m.tokenId;
        } catch {
          /* chain read failed; the subgraph may still answer */
        }
        const g = await loadGraphById(target.id);
        if (positionId === null && g) positionId = BigInt(g.position.id);
        if (cancelled) return;
        if (positionId === null) {
          setResolver(
            g === null && graph.state !== "error"
              ? {state: "not-found", name: `mandate ${target.id}`}
              : {state: "error", error: "The position behind this mandate number could not be determined (contract storage is deleted on revoke; the subgraph did not answer)."}
          );
          return;
        }
        loadResolver(positionId);
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target && "id" in target ? target.id.toString() : "", tick]);

  const g = graph.state === "ok" ? graph.mandate : null;
  const revoked = g?.status === "REVOKED";

  return (
    <section className="exhibit" aria-labelledby="lk-h">
      <div className="exhibit-head">
        <span className="caps">Lookup</span>
        <h2 id="lk-h">What may this bot do?</h2>
        <p>
          A mandate number, or a name. The scope comes back from the ENS resolver — what any ENS client would return, no Envoyage software
          involved — beside the mandate's status from the subgraph.
        </p>
      </div>

      <form
        className="lookup-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="lookup-q" className="visually-hidden">
          Mandate number or ENS name
        </label>
        <input id="lookup-q" className="field" style={{maxWidth: 360}} value={input} onChange={(e) => setInput(e.target.value)} placeholder={`1  or  38896.${ENS_PARENT}`} />
        <button className="act act-primary" type="submit" disabled={!input.trim()}>
          Look up
        </button>
        <button
          type="button"
          className="act act-ghost"
          onClick={() => {
            setInput(DEMO_MANDATE_ID.toString());
            submit(DEMO_MANDATE_ID.toString());
          }}
        >
          Try mandate No. {DEMO_MANDATE_ID.toString()}
        </button>
      </form>
      {target?.kind === "invalid" && <p className="gate gate-refused">{target.reason}</p>}

      {target && target.kind !== "invalid" && (
        <div className="lookup-cards">
          {/* resolver card */}
          <article className="sheet" aria-label="ENS resolver">
            <div className="docket">
              <span className="caps">From the ENS resolver</span>
              <Sponsor name="ENS" />
            </div>
            {resolver.state === "pending" && <p className="pending">Resolving records…</p>}
            {resolver.state === "error" && (
              <p className="gate gate-refused">
                {resolver.error}{" "}
                <button className="act act-ghost sm" onClick={() => setTick((x) => x + 1)}>
                  Retry
                </button>
              </p>
            )}
            {resolver.state === "not-found" && (
              <p className="gate">
                <b>Name not found.</b> Nothing under {ENS_PARENT} resolves for {resolver.name}. A name exists only once a mandate has been published.
              </p>
            )}
            {resolver.state === "ok" && (
              <>
                {revoked && (
                  <p className="banner" role="status">
                    Mandate revoked <span className="num">{revokedBlock(graph)}</span> — this record is historical. The permission is gone; the record of what was permitted is not.
                  </p>
                )}
                {graph.state === "not-indexed" && (
                  <p className="gate">Resolves, but the subgraph has not indexed a mandate for it yet.</p>
                )}
                <div className="ens-name" style={{fontSize: "clamp(22px, 3vw, 32px)"}}>
                  {resolver.name.replace(`.${ENS_PARENT}`, "")}.<span className="tld">{ENS_PARENT}</span>
                </div>
                <div className="records" style={{marginTop: 14}}>
                  <dl>
                    {Object.entries(resolver.records).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd className={k === KEEPER_KEY ? "writable" : undefined}>
                          {v || <span className="pending">(unset)</span>}
                          {k === KEEPER_KEY && <span className="writable-note">the one record the bot may write</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </>
            )}
          </article>

          {/* subgraph card */}
          <article className="sheet" aria-label="Subgraph">
            <div className="docket">
              <span className="caps">From the Envoyage subgraph</span>
              <Sponsor name="The Graph" />
            </div>
            {graph.state === "pending" && <p className="pending">Querying the subgraph…</p>}
            {graph.state === "error" && (
              <p className="gate gate-refused">
                Subgraph query failed: {graph.error}{" "}
                <button className="act act-ghost sm" onClick={() => setTick((x) => x + 1)}>
                  Retry
                </button>
              </p>
            )}
            {graph.state === "not-indexed" && <p className="gate">No mandate indexed for this {target.kind === "mandate" ? "number" : "position"} yet.</p>}
            {graph.state === "ok" && (
              <>
                <div className="row-grid">
                  <div>
                    <span className="label">Mandate</span>
                    <span className="value num">No. {graph.mandate.mandateId}</span>
                  </div>
                  <div>
                    <span className="label">Status</span>
                    <span className={`value status status-${graph.mandate.status.toLowerCase()}`}>{graph.mandate.status.toLowerCase()}</span>
                  </div>
                  <div>
                    <span className="label">Executions</span>
                    <span className="value num">{graph.mandate.executionCount}</span>
                  </div>
                  <div>
                    <span className="label">Owner</span>
                    <span className="value mono" style={{fontSize: 15}}>{short(graph.mandate.grantor)}</span>
                  </div>
                  <div>
                    <span className="label">Keeper</span>
                    <span className="value mono" style={{fontSize: 15}}>{short(graph.mandate.keeper.id)}</span>
                  </div>
                  <div>
                    <span className="label">Indexed to block</span>
                    <span className="value num">{graph.indexedBlock}</span>
                  </div>
                </div>
                {graph.executions.length > 0 && (
                  <div className="ledger-wrap" style={{marginTop: 14}}>
                    <table className="ledger" style={{minWidth: 420}}>
                      <caption className="visually-hidden">Executions</caption>
                      <thead>
                        <tr>
                          <th scope="col">Block</th>
                          <th scope="col">Liquidity added</th>
                          <th scope="col">Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {graph.executions.map((e) => (
                          <tr key={e.id}>
                            <td className="num">{e.block}</td>
                            <td className="num">+{Number(formatUnits(BigInt(e.liquidityAdded), 18)).toFixed(6)}</td>
                            <td>
                              <a className="mono" href={`${EXPLORER}/tx/${e.tx}`} target="_blank" rel="noreferrer">
                                {short(e.tx)}
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </article>
        </div>
      )}

      {/* the instrument, typeset from the resolver's records */}
      {resolver.state === "ok" && (
        <div style={{marginTop: 24}}>
          <MandatePreview
            terms={{
              tokenId: BigInt(resolver.name.replace(`.${ENS_PARENT}`, "")),
              keeper: (resolver.records["envoyage:keeper"] || REFERENCE_KEEPER) as Address,
              feeRecipient: (g?.feeRecipient || resolver.records["envoyage:keeper"] || REFERENCE_KEEPER) as Address,
              maxFeeBps: Number(resolver.records["envoyage:maxFeeBps"] || 0),
              minInterval: BigInt(resolver.records["envoyage:minInterval"] || 0),
              expiry: g ? BigInt(g.expiry) : 0n,
              compoundAllowed: resolver.records["envoyage:actions"] === "compound"
            }}
            status={revoked ? "revoked" : "in-force"}
            mandateId={g ? BigInt(g.mandateId) : null}
            docket="keeper, cap, cooldown and actions from ENS; expiry and recipient from the subgraph"
          />
        </div>
      )}
    </section>
  );
}

function revokedBlock(graph: Graph): string {
  if (graph.state !== "ok") return "?";
  const m = graph.mandate;
  return m.revokedAt ? `(${new Date(Number(m.revokedAt) * 1000).toISOString().slice(0, 10)})` : "?";
}
