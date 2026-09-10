import {useEffect, useState} from "react";
import {formatUnits, type Hex} from "viem";
import {Seal} from "./kit";
import {ENVOYAGE, EXPLORER, DEMO_MANDATE_ID, ENS_PARENT, KEEPER_KEY} from "../lib/config";
import {fetchEnvoyage, fetchUniswapScale, fetchMainnetCensus, type Census, type UniswapScale, type MandateRow, type Execution as GraphExecution} from "../lib/graph";
import {
  readMandate,
  readCanCompound,
  readPositionOwner,
  verifyExecutionReceipts,
  type ReceiptCheck,
  // kept only as an independent cross-check of the subgraph, not to render the ledger
  readEnsScope,
  REFUSAL_REASONS,
  type Mandate
} from "../lib/envoyage";

const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const link = (path: string, label: string) => (
  <a href={`${EXPLORER}/${path}`} target="_blank" rel="noreferrer" className="mono">
    {label}
  </a>
);

export function Overview() {
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [reason, setReason] = useState<Hex | null>(null);
  const [pos, setPos] = useState<{owner: string; approved: string} | null>(null);
  // null until the chain has answered. An empty array would render "no executions"
  // while the read is still in flight — a pending state shown as an empty fact.
  const [receipts, setReceipts] = useState<ReceiptCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [census, setCensus] = useState<Census | null>(null);
  const [indexedBlock, setIndexedBlock] = useState<number | null>(null);
  const [rows, setRows] = useState<MandateRow[]>([]);
  // The execution HISTORY is rendered from our subgraph — this is what the subgraph
  // is for. The RPC log read below is kept only to cross-check the count, which is
  // how we caught an RPC returning 1 of 3 earlier: the subgraph is now ground truth
  // and the chain is the audit.
  const [graphExecs, setGraphExecs] = useState<GraphExecution[] | null>(null);
  const [pool, setPool] = useState<{currency0: string; currency1: string} | null>(null);

  const [scale, setScale] = useState<UniswapScale | null>(null);
  // Distinguishes "not attempted" from "attempted and failed". Without it a Gateway
  // outage renders as "no key configured", which blames the wrong thing.
  const [scaleError, setScaleError] = useState<string | null>(null);
  // Mainnet census: our handler on Ethereum mainnet. Loads independently of Sepolia.
  const [mainnet, setMainnet] = useState<{census: Census; indexedBlock: number} | null>(null);
  const [mainnetError, setMainnetError] = useState<string | null>(null);
  const [ens, setEns] = useState<{node: string; records: Record<string, string>} | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await readMandate(DEMO_MANDATE_ID);
        setMandate(m);
        const [r, p] = await Promise.all([readCanCompound(DEMO_MANDATE_ID), readPositionOwner(m.tokenId)]);
        setReason(r);
        setPos(p);

        // ENS is read through the resolver, not reused from the values above, so what
        // is shown here is what a stranger's ENS client would get.
        readEnsScope(m.tokenId).then(setEns).catch(() => {});
        import("../lib/actions").then(({positionCurrencies}) =>
          positionCurrencies(m.tokenId).then(setPool).catch(() => {})
        );
      } catch (err) {
        // Surfaced rather than swallowed. An empty page that silently failed to read
        // the chain looks identical to a page with nothing to show.
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    // The two Graph sources load independently of the chain reads, so a slow or
    // failing indexer never blanks the parts that come straight from Sepolia.
    fetchEnvoyage()
      .then((d) => {
        setCensus(d.census);
        setRows(d.mandates);
        setIndexedBlock(d.indexedBlock);
        setGraphExecs(d.executions);
        // Chain audit of the subgraph's own rows: one receipt per execution.
        verifyExecutionReceipts(d.executions.map((e) => e.tx as `0x${string}`))
          .then(setReceipts)
          .catch(() => setReceipts(null));
      })
      .catch((e) => setGraphError(e instanceof Error ? e.message : String(e)));

    fetchMainnetCensus()
      .then(setMainnet)
      .catch((e) => setMainnetError(e instanceof Error ? e.message : String(e)));

    fetchUniswapScale()
      .then(setScale)
      .catch((e) => setScaleError(e instanceof Error ? e.message : String(e)));
  }, []);


  // ── derived ───────────────────────────────────────────────────────────────
  const revoked = mandate !== null && mandate.keeper === "0x0000000000000000000000000000000000000000";
  const approvedToEnvoyage = pos?.approved.toLowerCase() === ENVOYAGE.toLowerCase();
  const allowedNow = reason === "0x00000000";

  const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
  const gx = graphExecs ?? [];
  const liqAdded = sum(gx.map((e) => BigInt(e.liquidityAdded)));
  const fee0 = sum(gx.map((e) => BigInt(e.fee0ToKeeper)));
  const fee1 = sum(gx.map((e) => BigInt(e.fee1ToKeeper)));
  // Chain audit phrased as what was checked: each indexed transaction's receipt.
  const crossCheck = (() => {
    if (!receipts || graphExecs === null) return null;
    const ok = receipts.filter((r) => r.result === "confirmed").length;
    const bad = receipts.filter((r) => r.result === "mismatch").length;
    const down = receipts.filter((r) => r.result === "unreachable").length;
    if (ok === receipts.length) return `Each of the ${ok} indexed transactions was confirmed against its own receipt on Sepolia.`;
    const parts = [`${ok} of ${receipts.length} confirmed by receipt`];
    if (bad) parts.push(`${bad} receipt(s) do not match the subgraph — a real discrepancy`);
    if (down) parts.push(`${down} receipt(s) unreachable on the RPC right now`);
    return parts.join("; ") + ".";
  })();

  const unbounded = census ? census.activeBlanketApprovals + census.activeUnscopedApprovals : null;
  const scoped = census ? census.activeScopedApprovals : null;

  const fmtDate = (t: bigint) =>
    t === 0n ? "—" : new Date(Number(t) * 1000).toISOString().slice(0, 10);
  const fmtLiq = (v: bigint) => formatUnits(v, 18);
  // Headline figures are rounded so a 20-digit value never has to wrap; the ledger
  // below carries every digit, so nothing is lost — only moved.
  const fmtLiqShort = (v: bigint) => Number(formatUnits(v, 18)).toFixed(6);

  return (
    <>
      {/* 1 ── what this is, before any number */}
      <section className="lede" aria-labelledby="lede-h">
        <h1 id="lede-h">
          A keeper that can <em>grow</em> your position and do nothing else with it.
        </h1>
        <p>
          On Uniswap v4, the only way to let a bot compound your fees is{" "}
          <code>approve(keeper, tokenId)</code> — which says <strong>which</strong> position it may
          touch and nothing about <strong>what</strong> it may do. An approved bot can withdraw
          the liquidity and send it to itself. Envoyage replaces that with a{" "}
          <strong>mandate</strong>: a limited power of attorney whose articles are enforced by the
          contract, not promised by the keeper.
        </p>
      </section>

      {/* 2 ── the instrument */}
      <section className="exhibit" aria-labelledby="s2">
        <div className="exhibit-head">
          <span className="caps">The instrument</span>
          <h2 id="s2">The mandate</h2>
          <p>
            What this keeper may do to position #{mandate?.tokenId.toString() ?? "…"}, and what it may
            not. Every line is read live from the contract on Sepolia.
          </p>
        </div>

        {error && (
          <div className="error" role="alert">
            <b>Could not read Sepolia.</b>
            <span>
              Nothing below this line is shown until the chain answers. <code>{error}</code>
            </span>
          </div>
        )}
        {!mandate && !error && <p className="pending">Reading the mandate from Sepolia…</p>}

        {mandate && (
          <article className="sheet" aria-label={`Mandate ${DEMO_MANDATE_ID}`} data-state={revoked ? "revoked" : "in-force"}>
            {revoked && (
              <span className="stamp-revoked" aria-hidden="true">
                Revoked
              </span>
            )}
            <div className="docket">
              <span>
                <span className="caps">Mandate No. {DEMO_MANDATE_ID.toString()}</span> · Sepolia
              </span>
              <span>
                Registered with {link(`address/${ENVOYAGE}#code`, short(ENVOYAGE))}
              </span>
            </div>

            <h3 className="instrument-title">
              Limited power of attorney over Uniswap v4 position No. {mandate.tokenId.toString()}
            </h3>
            <p className="instrument-sub">
              {pool && (
                <>
                  In the {link(`token/${pool.currency0}`, short(pool.currency0))} /{" "}
                  {link(`token/${pool.currency1}`, short(pool.currency1))} pool.{" "}
                </>
              )}
              Granted by the position's owner.{" "}
              {revoked ? "Revoked by the owner." : `Valid until ${fmtDate(mandate.expiry)}, or until revoked.`}
            </p>

            <dl className="signatories">
              <div className="signatory">
                <dt className="visually-hidden">Grantor</dt>
                <dd className="line">{link(`address/${mandate.grantor}`, short(mandate.grantor))}</dd>
                <dd className="role">
                  <span className="caps">Grantor</span>the position's owner
                </dd>
              </div>
              <div className="signatory">
                <dt className="visually-hidden">Attorney-in-fact</dt>
                <dd className="line">{link(`address/${mandate.keeper}`, short(mandate.keeper))}</dd>
                <dd className="role">
                  <span className="caps">Attorney-in-fact</span>the keeper
                </dd>
              </div>
              <div className="signatory">
                <dt className="visually-hidden">Custodian</dt>
                <dd className="line">
                  {pos ? (
                    approvedToEnvoyage ? (
                      <>Envoyage</>
                    ) : (
                      link(`address/${pos.approved}`, short(pos.approved))
                    )
                  ) : (
                    <span className="pending">reading…</span>
                  )}
                </dd>
                <dd className="role">
                  <span className="caps">Custodian</span>
                  {pos && approvedToEnvoyage ? "holds the approval — never the keeper" : "holds the approval"}
                </dd>
              </div>
            </dl>

            <div className="articles">
              <div className="article">
                <h3 className="caps">Article 1 · Powers granted</h3>
                <p>The attorney-in-fact may</p>
                <ol className="clauses">
                  <li className="clause">
                    <span className="no">1.1</span>
                    <span className="text">
                      Call <strong>compound</strong>: harvest the fees this position has earned and reinvest them into the same position.
                    </span>
                  </li>
                  <li className="clause">
                    <span className="no">1.2</span>
                    <span className="text">
                      Retain at most <span className="num">{(mandate.maxFeeBps / 100).toFixed(2)}%</span> of the{" "}
                      <strong>fees harvested</strong>, and never any part of the position itself.
                    </span>
                  </li>
                  <li className="clause">
                    <span className="no">1.3</span>
                    <span className="text">
                      Be paid only to {link(`address/${mandate.feeRecipient}`, short(mandate.feeRecipient))}, an address fixed when this mandate was granted.
                    </span>
                  </li>
                  <li className="clause">
                    <span className="no">1.4</span>
                    <span className="text">
                      Act no more than once every <span className="num">{mandate.minInterval.toString()}</span> seconds.
                    </span>
                  </li>
                  <li className="clause">
                    <span className="no">1.5</span>
                    <span className="text">
                      Act until <span className="num">{fmtDate(mandate.expiry)}</span>, or until the grantor revokes, whichever comes first.
                    </span>
                  </li>
                </ol>
              </div>

              <div className="article">
                <h3 className="caps">Article 2 · Powers withheld</h3>
                <p>The attorney-in-fact may not</p>
                <ol className="clauses">
                  <li className="clause struck">
                    <span className="no">2.1</span>
                    <span className="text">
                      <span>Withdraw liquidity from the position.</span>
                      <span className="why">No function accepts an action list. There is nothing to send.</span>
                    </span>
                  </li>
                  <li className="clause struck">
                    <span className="no">2.2</span>
                    <span className="text">
                      <span>Choose where anything goes.</span>
                      <span className="why">The recipient is a constant in code, not a parameter.</span>
                    </span>
                  </li>
                  <li className="clause struck">
                    <span className="no">2.3</span>
                    <span className="text">
                      <span>Swap, move the range, or touch another position.</span>
                      <span className="why">Only <code>compound(id, minFee)</code> exists.</span>
                    </span>
                  </li>
                  <li className="clause struck">
                    <span className="no">2.4</span>
                    <span className="text">
                      <span>Keep acting after the position is sold.</span>
                      <span className="why">Every call checks <code>ownerOf == grantor</code>.</span>
                    </span>
                  </li>
                  <li className="clause struck">
                    <span className="no">2.5</span>
                    <span className="text">
                      <span>Change any of the above.</span>
                      <span className="why">No admin, no upgrade path, no <code>delegatecall</code> in the bytecode.</span>
                    </span>
                  </li>
                </ol>
              </div>
            </div>

            <div className="attest">
              <div>
                <p className="verdict" style={{margin: 0}}>
                  Right now the attorney-in-fact{" "}
                  <b>{reason === null ? "…" : allowedNow ? "may act." : "may not act."}</b>
                  {revoked && <span className="reason">Every clause above is struck: the grantor revoked this mandate.</span>}
                  {reason && !allowedNow && (
                    <span className="reason">{REFUSAL_REASONS[reason] ?? `unknown reason ${reason}`}</span>
                  )}
                </p>
                <p className="how">
                  Read from <code>canCompound()</code>. A revert would discard any explanatory event, so
                  the reason is returned by a view.
                </p>
              </div>
              <Seal
                off={revoked}
                centre={revoked ? "Revoked" : "In force"}
                rim={revoked ? `Envoyage · Sepolia · mandate ${DEMO_MANDATE_ID} · revoked · ` : `Envoyage · Sepolia · in force until ${fmtDate(mandate.expiry)} · `}
              />
            </div>
          </article>
        )}
      </section>

      {/* 3 ── proof */}
      <section className="exhibit" aria-labelledby="s3">
        <div className="exhibit-head">
          <span className="caps">Exhibit A</span>
          <h2 id="s3">What the keeper actually did</h2>
          <p>Every <code>MandateExecuted</code> event this mandate has emitted on Sepolia, from our subgraph, each row checked against its own receipt.</p>
        </div>

        {graphExecs === null && !graphError && <p className="pending">Loading execution history from the subgraph…</p>}
        {graphExecs !== null && graphExecs.length === 0 && <p className="pending">No executions indexed yet.</p>}
        {graphError && (
          <div className="error" role="alert">
            <b>Sepolia subgraph query failed.</b>
            <span>The ledger is withheld rather than shown empty. <code>{graphError}</code></span>
          </div>
        )}
        {graphExecs !== null && graphExecs.length > 0 && (
          <>
            <div className="totals">
              <div className="total">
                <div className="label">Compounds</div>
                <div className="value num">{graphExecs.length}</div>
                <div className="note">indexed by the Envoyage subgraph</div>
              </div>
              <div className="total">
                <div className="label">Liquidity added to the owner's position</div>
                <div className="value num accent" title={`+${fmtLiq(liqAdded)}`}>+{fmtLiqShort(liqAdded)}</div>
                <div className="note">no swap; sized from harvested fees only</div>
              </div>
              <div className="total">
                <div className="label">Liquidity taken by the keeper</div>
                <div className="value num">0</div>
                <div className="note">not blocked by a check — no call exists that could</div>
              </div>
            </div>

            <div className="ledger-wrap">
              <table className="ledger">
                <caption className="visually-hidden">Executions of mandate {DEMO_MANDATE_ID.toString()}, from the subgraph</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Block</th>
                    <th scope="col">Liquidity added</th>
                    <th scope="col">Fee to keeper (0 / 1)</th>
                    <th scope="col">Liquidity to keeper</th>
                    <th scope="col">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {[...graphExecs].reverse().map((e) => (
                    <tr key={e.id}>
                      <td className="num">{new Date(Number(e.timestamp) * 1000).toISOString().slice(0, 10)}</td>
                      <td className="num">{e.block}</td>
                      <td className="num">+{fmtLiq(BigInt(e.liquidityAdded))}</td>
                      <td className="num">{fmtLiq(BigInt(e.fee0ToKeeper))} / {fmtLiq(BigInt(e.fee1ToKeeper))}</td>
                      <td className="num zero">0</td>
                      <td>{link(`tx/${e.tx}`, short(e.tx))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="foot-note">
              {crossCheck ?? "Checking each indexed transaction against its receipt on Sepolia…"}{" "}
              Totals: {fmtLiq(fee0)} / {fmtLiq(fee1)} to the keeper, the capped share of harvested fees;
              Envoyage holds zero after every transaction.
            </p>
          </>
        )}
      </section>

      {/* 4 ── verify */}
      <section className="exhibit" aria-labelledby="s4">
        <div className="exhibit-head">
          <span className="caps">Exhibit B</span>
          <h2 id="s4">Anyone can verify it</h2>
          <p>The scope is published as ENS text records. These values are resolved through the ENS resolver, not copied from the contract above.</p>
        </div>

        <div className="ens">
          <div>
            <div className="ens-name">
              {mandate?.tokenId.toString() ?? "…"}.<span className="tld">{ENS_PARENT}</span>
            </div>
            <p>
              A subname per position. Paste it into any ENS client and the mandate's terms come back
              as text records, with no Envoyage software involved. The keeper holds write access to
              exactly one key, <code>{KEEPER_KEY}</code>; writing to any other record fails with{" "}
              <code>EACUnauthorizedAccountRoles</code>.
            </p>
          </div>

          <div className="records">
            {!ens && !error && <p className="pending">Resolving records…</p>}
            {ens && (
              <dl>
                {Object.entries(ens.records).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className={k === KEEPER_KEY ? "writable" : undefined}>
                      {v || <span className="pending">(unset)</span>}
                      {k === KEEPER_KEY && <span className="writable-note">the one record the keeper may write</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </section>

      {/* 5 ── why it matters */}
      <section className="exhibit" aria-labelledby="s5">
        <div className="exhibit-head">
          <span className="caps">Exhibit C</span>
          <h2 id="s5">Why it matters</h2>
          <p>
            Every delegation ever granted on Uniswap v4's PositionManager, counted by our own subgraph:
            on <strong>Ethereum mainnet</strong>, where the money is, and on Sepolia, where the scoped
            alternative runs.
          </p>
        </div>

        {mainnetError && (
          <div className="error" role="alert">
            <b>Mainnet census unavailable.</b>
            <span>Figures are withheld rather than shown as zero. <code>{mainnetError}</code></span>
          </div>
        )}
        {graphError && (
          <div className="error" role="alert">
            <b>Sepolia subgraph query failed.</b>
            <span>Figures are withheld rather than shown as zero. <code>{graphError}</code></span>
          </div>
        )}
        {!mainnet && !mainnetError && <p className="pending">Reading the mainnet census…</p>}

        {mainnet && (
          <>
            <div className="census">
              <div>
                <div className="net-tag caps">Ethereum mainnet</div>
                <div className="figure num">
                  {(mainnet.census.activeBlanketApprovals + mainnet.census.activeUnscopedApprovals).toLocaleString()}
                </div>
                <p className="caption">
                  <strong>unbounded delegations over real positions</strong>:{" "}
                  {mainnet.census.activeBlanketApprovals} via <code>setApprovalForAll</code> (every position the
                  owner holds, now and in future), {mainnet.census.activeUnscopedApprovals} single-position. Each one
                  can withdraw everything it covers. {mainnet.census.activeScopedApprovals === 0 && "Zero are scoped: no bounded alternative exists on mainnet."}
                </p>
              </div>
              <div className="vs" aria-hidden="true">against</div>
              <div className="scoped">
                <div className="net-tag caps">Sepolia</div>
                <div className="figure num">{scoped ?? "…"}</div>
                <p className="caption">
                  <strong>scoped</strong>: Envoyage mandates, each limited to <code>compound</code> with a capped fee,
                  a cooldown and an expiry.{" "}
                  {census && <>Beside {unbounded} unbounded ones on the same testnet.</>}
                </p>
              </div>
            </div>
            <p className="foot-note">
              Mainnet: {mainnet.census.distinctDelegates} distinct delegates across {mainnet.census.totalApprovalEvents}{" "}
              approval events, indexed to block {mainnet.indexedBlock.toLocaleString()}.
              {census && indexedBlock && (
                <> Sepolia: {census.distinctDelegates} delegates, {census.totalApprovalEvents} events, block {indexedBlock.toLocaleString()}.</>
              )}
              {scale && (
                <> Uniswap's own subgraph puts v4 at {Number(scale.pools).toLocaleString()} pools and{" "}
                {Number(scale.txCount).toLocaleString()} transactions.</>
              )}
            </p>
          </>
        )}
      </section>

      {/* 6 ── sources */}
      <section className="exhibit" aria-labelledby="s6">
        <div className="exhibit-head">
          <span className="caps">Sources</span>
          <h2 id="s6">Where the numbers come from</h2>
          <p>Three Graph sources, two of them ours and one Uniswap's. None answers the question alone.</p>
        </div>
        <div className="sources">
          <div className="source">
            <h3>Envoyage subgraph, Sepolia</h3>
            <p>Mandates, executions, and the census of approvals on the PositionManager. Knows exactly what each keeper may do; knows nothing about the wider population.</p>
            <div className="meta">api.studio.thegraph.com/query/62788/envoyage/v0.0.4</div>
          </div>
          <div className="source">
            <h3>Envoyage census, Ethereum mainnet</h3>
            <p>The same census handler pointed at Uniswap v4's mainnet PositionManager. Counts every unbounded delegation over real positions; its scoped count is zero, because nothing scoped exists there yet.</p>
            <div className="meta">
              api.studio.thegraph.com/query/62788/envoyage-census-mainnet/v0.0.1
              {mainnet && <> · block {mainnet.indexedBlock.toLocaleString()}</>}
              {mainnetError && <> · {mainnetError.slice(0, 80)}</>}
            </div>
          </div>
          <div className="source">
            <h3>Uniswap v4 subgraph, The Graph Network</h3>
            <p>Pools, positions and owners on mainnet, via the Gateway. Knows how large the exposed population is; has no concept of a permission scope, because an approval does not carry one.</p>
            <div className="meta">
              {scale && "reached via gateway.thegraph.com"}
              {!scale && scaleError && <>gateway query failed; figures withheld rather than shown as zero. {scaleError.slice(0, 160)}{scaleError.length > 160 ? "…" : ""}</>}
              {!scale && !scaleError && !import.meta.env.VITE_GRAPH_GATEWAY_KEY && "not queried: no VITE_GRAPH_GATEWAY_KEY in this build"}
              {!scale && !scaleError && import.meta.env.VITE_GRAPH_GATEWAY_KEY && "querying gateway.thegraph.com…"}
            </div>
          </div>
        </div>
        {rows.length > 1 && (
          <p className="foot-note">{rows.length} mandates indexed in total.</p>
        )}
      </section>

      <footer className="foot">
        <span>Chain state read directly from Sepolia over two independent RPC operators.</span>
        <a href="https://github.com/envoyage-protocol/envoyage">github.com/envoyage-protocol/envoyage</a>
      </footer>
    </>
  );
}
