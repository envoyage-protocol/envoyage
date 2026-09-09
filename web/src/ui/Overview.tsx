import {useEffect, useState} from "react";
import {formatUnits, type Hex} from "viem";
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
          <strong>mandate</strong>: the bot passes two numbers, and the contract writes the
          Uniswap instructions itself, with the destination fixed in code.
        </p>
      </section>

      {/* 2 ── the instrument */}
      <section className="section" aria-labelledby="s2">
        <div className="section-head">
          <span className="n" aria-hidden="true">1</span>
          <h2 id="s2">The mandate</h2>
          <p>What this keeper may do to position #{mandate?.tokenId.toString() ?? "…"}, and what it may not. Read live from the contract.</p>
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
          <article className="instrument" aria-label={`Mandate ${DEMO_MANDATE_ID}`}>
            <div className="instrument-top">
              <div className="instrument-title">
                Mandate №{DEMO_MANDATE_ID.toString()}
                <small>
                  Limited authority over Uniswap v4 position #{mandate.tokenId.toString()}
                  {pool && (
                    <>
                      {" "}in the {link(`token/${pool.currency0}`, short(pool.currency0))} /{" "}
                      {link(`token/${pool.currency1}`, short(pool.currency1))} pool
                    </>
                  )}{" "}
                  · granted by its owner · {revoked ? "revoked" : `valid until ${fmtDate(mandate.expiry)}`}
                </small>
              </div>
              {revoked ? (
                <span className="seal off">Revoked</span>
              ) : (
                <span className="seal">In force</span>
              )}
            </div>

            <dl className="parties">
              <div className="party">
                <dt>Granted by</dt>
                <dd>{link(`address/${mandate.grantor}`, short(mandate.grantor))} <span className="pending">— the position's owner</span></dd>
              </div>
              <div className="party">
                <dt>Granted to</dt>
                <dd>{link(`address/${mandate.keeper}`, short(mandate.keeper))} <span className="pending">— the keeper</span></dd>
              </div>
              <div className="party">
                <dt>Authority held by</dt>
                <dd>
                  {pos ? (
                    approvedToEnvoyage ? (
                      <>Envoyage <span className="pending">— never the keeper</span></>
                    ) : (
                      link(`address/${pos.approved}`, short(pos.approved))
                    )
                  ) : (
                    <span className="pending">reading…</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="powers">
              <div className="permitted">
                <h3><span className="tag">Permitted</span> The keeper may</h3>
                <ul>
                  <li>
                    <span className="glyph" aria-hidden="true">✓</span>
                    <span>Call <strong>compound</strong> — harvest fees and reinvest them into this position</span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">✓</span>
                    <span>
                      Keep at most <span className="num">{(mandate.maxFeeBps / 100).toFixed(2)}%</span> of the{" "}
                      <strong>fees harvested</strong> — never of the position
                    </span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">✓</span>
                    <span>Be paid only to {link(`address/${mandate.feeRecipient}`, short(mandate.feeRecipient))}, fixed when the mandate was granted</span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">✓</span>
                    <span>Act no more than once every <span className="num">{mandate.minInterval.toString()}s</span></span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">✓</span>
                    <span>Act until <span className="num">{fmtDate(mandate.expiry)}</span>, or until the owner revokes</span>
                  </li>
                </ul>
              </div>

              <div className="withheld">
                <h3><span className="tag">Withheld</span> The keeper may not</h3>
                <ul>
                  <li>
                    <span className="glyph" aria-hidden="true">—</span>
                    <span>Withdraw liquidity<small>No function accepts an action list. There is nothing to send.</small></span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">—</span>
                    <span>Choose where anything goes<small>The recipient is a constant in code, not a parameter.</small></span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">—</span>
                    <span>Swap, move range, or touch another position<small>Only <code>compound(id, minFee)</code> exists.</small></span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">—</span>
                    <span>Keep acting after the position is sold<small>Every call checks <code>ownerOf == grantor</code>.</small></span>
                  </li>
                  <li>
                    <span className="glyph" aria-hidden="true">—</span>
                    <span>Change any of the above<small>No admin, no upgrade path, no <code>delegatecall</code> in the bytecode.</small></span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="attest">
              <span className="verdict">
                <span aria-hidden="true">{reason === null ? "·" : allowedNow ? "●" : "○"}</span>
                <span>
                  Right now the keeper{" "}
                  <b>{reason === null ? "…" : allowedNow ? "may act" : "may not act"}</b>
                  {reason && !allowedNow && <> — {REFUSAL_REASONS[reason] ?? `unknown reason ${reason}`}</>}
                </span>
              </span>
              <span>
                Read from <code>canCompound()</code>; a revert would discard any explanatory event, so
                the reason is returned by a view.
              </span>
            </div>
          </article>
        )}
      </section>

      {/* 3 ── proof */}
      <section className="section" aria-labelledby="s3">
        <div className="section-head">
          <span className="n" aria-hidden="true">2</span>
          <h2 id="s3">What the keeper actually did</h2>
          <p>Every <code>MandateExecuted</code> event this mandate has emitted on Sepolia.</p>
        </div>

        {graphExecs === null && !graphError && <p className="pending">Loading execution history from the subgraphâ¦</p>}
        {graphExecs !== null && graphExecs.length === 0 && <p className="pending">No executions indexed yet.</p>}
        {graphExecs !== null && graphExecs.length > 0 && (
          <>
            <div className="stats">
              <div className="stat">
                <div className="label">Compounds</div>
                <div className="value">{graphExecs.length}</div>
                <div className="note">indexed by the Envoyage subgraph</div>
              </div>
              <div className="stat">
                <div className="label">Liquidity added to the owner’s position</div>
                <div className="value accent" title={`+${fmtLiq(liqAdded)}`}>+{fmtLiqShort(liqAdded)}</div>
                <div className="note">no swap; sized from harvested fees only</div>
              </div>
              <div className="stat">
                <div className="label">Liquidity taken by the keeper</div>
                <div className="value">0</div>
                <div className="note">not blocked by a check — no call exists that could</div>
              </div>
            </div>

            <div className="ledger-wrap">
              <table className="ledger">
                <caption className="visually-hidden">Executions of mandate {DEMO_MANDATE_ID.toString()}, from the subgraph</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Block</th>
                    <th scope="col">Liquidity added</th>
                    <th scope="col">Fee to keeper (0 / 1)</th>
                    <th scope="col">To keeper</th>
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
            <p className="census-foot">
              Rendered from the subgraph.{" "}
              {crossCheck}{" "}
              Totals: {fmtLiq(fee0)} / {fmtLiq(fee1)} to the keeper, the capped share of harvested fees;
              Envoyage holds zero after every transaction.
            </p>
          </>
        )}
      </section>

      {/* 4 ── verify */}
      <section className="section" aria-labelledby="s4">
        <div className="section-head">
          <span className="n" aria-hidden="true">3</span>
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
              as text records — no Envoyage software required. The keeper holds write access to
              exactly one key, <code>{KEEPER_KEY}</code>; writing to any other record fails with{" "}
              <code>EACUnauthorizedAccountRoles</code>.
            </p>
          </div>

          <div className="records">
            {!ens && !error && <p className="pending" style={{padding: "12px 16px"}}>Resolving records…</p>}
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
      <section className="section" aria-labelledby="s5">
        <div className="section-head">
          <span className="n" aria-hidden="true">4</span>
          <h2 id="s5">Why it matters</h2>
          <p>
            Every delegation ever granted on Uniswap v4's PositionManager, counted by our own subgraph —
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
                <div className="net-tag">Ethereum mainnet</div>
                <div className="figure num">
                  {mainnet.census.activeBlanketApprovals + mainnet.census.activeUnscopedApprovals}
                </div>
                <p className="caption">
                  <strong>unbounded delegations over real positions</strong> —{" "}
                  {mainnet.census.activeBlanketApprovals} via <code>setApprovalForAll</code> (every position the
                  owner holds, now and in future), {mainnet.census.activeUnscopedApprovals} single-position. Each one
                  can withdraw everything it covers. {mainnet.census.activeScopedApprovals === 0 && "Zero are scoped: no bounded alternative exists on mainnet."}
                </p>
              </div>
              <div className="vs" aria-hidden="true">against</div>
              <div className="scoped">
                <div className="net-tag">Sepolia</div>
                <div className="figure num">{scoped ?? "…"}</div>
                <p className="caption">
                  <strong>scoped</strong> — Envoyage mandates, each limited to <code>compound</code> with a capped fee,
                  a cooldown and an expiry.{" "}
                  {census && <>Beside {unbounded} unbounded ones on the same testnet.</>}
                </p>
              </div>
            </div>
            <p className="census-foot">
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
      <section className="section" aria-labelledby="s6">
        <div className="section-head">
          <span className="n" aria-hidden="true">5</span>
          <h2 id="s6">Where the numbers come from</h2>
          <p>Three Graph sources — two of them ours, one Uniswap's. None answers the question alone.</p>
        </div>
        <div className="sources sources-3">
          <div className="source">
            <h3>Envoyage subgraph — Sepolia</h3>
            <p>Mandates, executions, and the census of approvals on the PositionManager. Knows exactly what each keeper may do; knows nothing about the wider population.</p>
            <div className="meta">api.studio.thegraph.com/query/62788/envoyage/v0.0.4</div>
          </div>
          <div className="source">
            <h3>Envoyage census — Ethereum mainnet</h3>
            <p>The same census handler pointed at Uniswap v4's mainnet PositionManager. Counts every unbounded delegation over real positions; its scoped count is zero, because nothing scoped exists there yet.</p>
            <div className="meta">
              api.studio.thegraph.com/query/62788/envoyage-census-mainnet/v0.0.1
              {mainnet && <> · block {mainnet.indexedBlock.toLocaleString()}</>}
              {mainnetError && <> · {mainnetError.slice(0, 80)}</>}
            </div>
          </div>
          <div className="source">
            <h3>Uniswap v4 subgraph — The Graph Network</h3>
            <p>Pools, positions and owners on mainnet, via the Gateway. Knows how large the exposed population is; has no concept of a permission scope, because an approval does not carry one.</p>
            <div className="meta">
              {scale && "reached via gateway.thegraph.com"}
              {!scale && scaleError && <>gateway query failed — figures withheld rather than shown as zero. {scaleError.slice(0, 160)}{scaleError.length > 160 ? "…" : ""}</>}
              {!scale && !scaleError && !import.meta.env.VITE_GRAPH_GATEWAY_KEY && "not queried — no VITE_GRAPH_GATEWAY_KEY in this build"}
              {!scale && !scaleError && import.meta.env.VITE_GRAPH_GATEWAY_KEY && "querying gateway.thegraph.com…"}
            </div>
          </div>
        </div>
        {rows.length > 1 && (
          <p className="census-foot">{rows.length} mandates indexed in total.</p>
        )}
      </section>

      <footer className="foot">
        <span>Chain state read directly from Sepolia over two independent RPC operators.</span>
        <a href="https://github.com/envoyage-protocol/envoyage">github.com/envoyage-protocol/envoyage</a>
      </footer>
    </>
  );
}