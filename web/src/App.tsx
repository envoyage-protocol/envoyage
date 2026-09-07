import {useEffect, useState} from "react";
import {formatUnits, type Hex} from "viem";
import {ENVOYAGE, EXPLORER, DEMO_MANDATE_ID, ENS_PARENT, KEEPER_KEY} from "./lib/config";
import {fetchEnvoyage, fetchUniswapScale, type Census, type UniswapScale, type MandateRow} from "./lib/graph";
import {
  readMandate,
  readCanCompound,
  readPositionOwner,
  readExecutions,
  readEnsScope,
  REFUSAL_REASONS,
  type Mandate,
  type Execution
} from "./lib/envoyage";

const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const link = (path: string, label: string) => (
  <a href={`${EXPLORER}/${path}`} target="_blank" rel="noreferrer" className="mono">
    {label}
  </a>
);

export function App() {
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [reason, setReason] = useState<Hex | null>(null);
  const [pos, setPos] = useState<{owner: string; approved: string} | null>(null);
  const [execs, setExecs] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [census, setCensus] = useState<Census | null>(null);
  const [indexedBlock, setIndexedBlock] = useState<number | null>(null);
  const [rows, setRows] = useState<MandateRow[]>([]);

  const [scale, setScale] = useState<UniswapScale | null>(null);
  const [ens, setEns] = useState<{node: string; records: Record<string, string>} | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await readMandate(DEMO_MANDATE_ID);
        setMandate(m);
        const [r, p, e] = await Promise.all([
          readCanCompound(DEMO_MANDATE_ID),
          readPositionOwner(m.tokenId),
          readExecutions(DEMO_MANDATE_ID)
        ]);
        setReason(r);
        setPos(p);
        setExecs(e);

        // ENS is read through the resolver, not reused from the values above, so what
        // is shown here is what a stranger's ENS client would get.
        readEnsScope(m.tokenId).then(setEns).catch(() => {});
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
      })
      .catch((e) => setGraphError(e instanceof Error ? e.message : String(e)));

    fetchUniswapScale().then(setScale).catch(() => {});
  }, []);

  const revoked = mandate !== null && mandate.keeper === "0x0000000000000000000000000000000000000000";
  const approvedToEnvoyage = pos?.approved.toLowerCase() === ENVOYAGE.toLowerCase();

  return (
    <div className="wrap">
      <header>
        <h1>Envoyage</h1>
        <p className="tag">
          Removes authority over <strong>intent</strong>. Not authority over <strong>execution</strong>.
        </p>
        <p className="chain">
          Sepolia · {link(`address/${ENVOYAGE}#code`, ENVOYAGE)} · verified
        </p>
      </header>

      <section className="panel">
        <h2>The exposure, counted</h2>
        {!census && !graphError && <p className="muted">Reading the subgraph…</p>}
        {graphError && <p className="err small mono">subgraph: {graphError}</p>}
        {census && (
          <>
            <div className="grid2">
              <div className="cmp danger">
                <p className="sub" style={{marginBottom: 6}}>Unbounded delegation, live on Uniswap v4</p>
                <p className="big" style={{margin: 0}}>
                  {census.activeBlanketApprovals + census.activeUnscopedApprovals}
                </p>
                <ul style={{marginTop: 10}}>
                  <li>
                    <strong>{census.activeBlanketApprovals}</strong> <code>setApprovalForAll</code> —
                    every position the owner holds, now and in future
                  </li>
                  <li>
                    <strong>{census.activeUnscopedApprovals}</strong> single-position approvals
                    with no scope attached
                  </li>
                  <li>
                    across <strong>{census.distinctDelegates}</strong> distinct delegate addresses
                  </li>
                </ul>
              </div>
              <div className="cmp safe">
                <p className="sub" style={{marginBottom: 6}}>Delegation that carries a scope</p>
                <p className="big" style={{margin: 0}}>{census.activeScopedApprovals}</p>
                <ul style={{marginTop: 10}}>
                  <li>Approvals pointing at Envoyage, where the recipient is fixed in code</li>
                  <li>Fee capped in bps of harvested fees, never of the position</li>
                  <li>Dies the moment the position changes hands</li>
                </ul>
              </div>
            </div>
            <p className="small muted" style={{marginBottom: 0}}>
              Counted from every <code>Approval</code> and <code>ApprovalForAll</code> emitted by
              Uniswap v4&rsquo;s PositionManager on Sepolia
              {indexedBlock && <> · indexed to block {indexedBlock.toLocaleString()}</>}
              {scale && (
                <>
                  {" "}· for scale, v4 on mainnet holds{" "}
                  <strong>{Number(scale.pools).toLocaleString()}</strong> pools across{" "}
                  <strong>{Number(scale.txCount).toLocaleString()}</strong> transactions
                </>
              )}
            </p>
          </>
        )}
      </section>

      {error && (
        <div className="panel">
          <h2>Could not read the chain</h2>
          <p className="err mono small">{error}</p>
        </div>
      )}

      <section className="panel">
        <h2>The problem, in one comparison</h2>
        <div className="grid2">
          <div className="cmp danger">
            <h3>approve(keeper, tokenId)</h3>
            <p className="sub">What every keeper needs today</p>
            <ul>
              <li>The keeper writes the v4 action list itself</li>
              <li><strong>4 actions</strong> take a recipient straight from the caller</li>
              <li>Nothing stops <code>DECREASE_LIQUIDITY</code> + <code>TAKE_PAIR(…, attacker)</code></li>
              <li>No fee cap, no cooldown, no expiry</li>
              <li>Survives the sale of the position</li>
            </ul>
          </div>
          <div className="cmp safe">
            <h3>A mandate</h3>
            <p className="sub">What Envoyage grants instead</p>
            <ul>
              <li><strong>Envoyage</strong> writes the action list; the keeper passes two numbers</li>
              <li>Recipient is a constant in code, not a parameter</li>
              <li>The attack above has no field to be expressed in</li>
              <li>Fee capped in bps of <em>harvested fees</em>, never of the position</li>
              <li>Dies the moment the position changes hands</li>
            </ul>
          </div>
        </div>
        <p className="small muted" style={{marginTop: 14, marginBottom: 0}}>
          All 26 v4 actions were traced against the source; see{" "}
          <a href="https://github.com/envoyage-protocol/envoyage/blob/main/docs/V4-ACTION-COMPLETENESS.md">
            V4-ACTION-COMPLETENESS.md
          </a>
          .
        </p>
      </section>

      <section className="panel">
        <h2>Live mandate #{DEMO_MANDATE_ID.toString()}</h2>
        {!mandate && !error && <p className="muted">Reading Sepolia…</p>}
        {mandate && (
          <div className="grid2">
            <table>
              <tbody>
                <tr>
                  <td>Status</td>
                  <td>
                    {revoked ? <span className="pill bad">REVOKED</span> : <span className="pill ok">ACTIVE</span>}
                  </td>
                </tr>
                <tr>
                  <td>Keeper</td>
                  <td>{link(`address/${mandate.keeper}`, short(mandate.keeper))}</td>
                </tr>
                <tr>
                  <td>Granted by</td>
                  <td>{link(`address/${mandate.grantor}`, short(mandate.grantor))}</td>
                </tr>
                <tr>
                  <td>Position</td>
                  <td className="mono">#{mandate.tokenId.toString()}</td>
                </tr>
                <tr>
                  <td>Fee cap</td>
                  <td>
                    <strong>{(mandate.maxFeeBps / 100).toFixed(2)}%</strong>{" "}
                    <span className="muted small">of harvested fees</span>
                  </td>
                </tr>
                <tr>
                  <td>Fee paid to</td>
                  <td>{link(`address/${mandate.feeRecipient}`, short(mandate.feeRecipient))}</td>
                </tr>
                <tr>
                  <td>Cooldown</td>
                  <td>{mandate.minInterval.toString()}s</td>
                </tr>
                <tr>
                  <td>Expires</td>
                  <td>
                    {mandate.expiry === 0n
                      ? "—"
                      : new Date(Number(mandate.expiry) * 1000).toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              </tbody>
            </table>

            <div>
              <div className="cmp" style={{marginBottom: 14}}>
                <h3 style={{fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em"}}>
                  Can the keeper act right now?
                </h3>
                <p style={{margin: "6px 0 0"}}>
                  {reason === null ? (
                    <span className="muted">checking…</span>
                  ) : reason === "0x00000000" ? (
                    <span className="pill ok">YES</span>
                  ) : (
                    <span className="pill warn">NO</span>
                  )}{" "}
                  {reason && <span className="small">{REFUSAL_REASONS[reason] ?? `Unknown selector ${reason}`}</span>}
                </p>
                <p className="small muted" style={{marginBottom: 0, marginTop: 10}}>
                  Read from <code>canCompound()</code>. The contract cannot emit an event explaining a
                  refusal — a revert would discard the log — so the reason is returned by a view
                  function instead.
                </p>
              </div>

              {pos && (
                <table>
                  <tbody>
                    <tr>
                      <td>Position owner</td>
                      <td>{link(`address/${pos.owner}`, short(pos.owner))}</td>
                    </tr>
                    <tr>
                      <td>ERC-721 approved to</td>
                      <td>
                        {approvedToEnvoyage ? (
                          <>
                            <span className="pill ok">Envoyage</span>{" "}
                            <span className="small muted">not the keeper</span>
                          </>
                        ) : (
                          link(`address/${pos.approved}`, short(pos.approved))
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Readable without us — {mandate ? `${mandate.tokenId}.${ENS_PARENT}` : ENS_PARENT}</h2>
        <p className="small muted" style={{marginTop: -6}}>
          Resolved through the ENSv2 resolver, not copied from the values above. Anyone can
          read this in any ENS client without visiting this page or trusting it.
        </p>
        {!ens && <p className="muted">Resolving…</p>}
        {ens && (
          <div className="grid2">
            <table>
              <tbody>
                {Object.entries(ens.records)
                  .filter(([k]) => k !== KEEPER_KEY)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td className="mono">{k}</td>
                      <td className="mono">{v || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="cmp">
              <h3 style={{fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em"}}>
                The one key the keeper may write
              </h3>
              <p className="mono" style={{margin: "8px 0 4px"}}>
                {KEEPER_KEY} = {ens.records[KEEPER_KEY] || "—"}
              </p>
              <p className="small muted" style={{marginBottom: 0}}>
                The bot writes this itself after each run. The identical call aimed at{" "}
                <code>envoyage:maxFeeBps</code> reverts <code>EACUnauthorizedAccountRoles</code> —
                so it can report what it did, and cannot rewrite what it is allowed to do.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>What the keeper actually did</h2>
        {execs.length === 0 && <p className="muted">No executions indexed yet.</p>}
        {rows.length > 0 && (
          <p className="small muted" style={{marginTop: -6}}>
            {rows[0].executionCount} execution{rows[0].executionCount === 1 ? "" : "s"} indexed ·
            fee cap {(rows[0].maxFeeBps / 100).toFixed(2)}% · cooldown {rows[0].minInterval}s
          </p>
        )}
        {execs.length > 0 && (
          <>
            <p className="big">
              +<span className="delta">{formatUnits(execs.reduce((a, e) => a + e.liquidityAdded, 0n), 18)}</span>{" "}
              <span className="muted" style={{fontSize: 15}}>liquidity added</span>
            </p>
            <table style={{marginTop: 10}}>
              <tbody>
                <tr>
                  <td>Executions</td>
                  <td>{execs.length}</td>
                </tr>
                <tr>
                  <td>Fees taken by keeper</td>
                  <td className="mono">
                    {formatUnits(execs.reduce((a, e) => a + e.fee0Paid, 0n), 18)} /{" "}
                    {formatUnits(execs.reduce((a, e) => a + e.fee1Paid, 0n), 18)}
                  </td>
                </tr>
                <tr>
                  <td>Liquidity taken by keeper</td>
                  <td>
                    <span className="pill ok">0</span>{" "}
                    <span className="small muted">no action exists that could</span>
                  </td>
                </tr>
                {execs.map((e) => (
                  <tr key={e.txHash}>
                    <td>Block {e.block.toString()}</td>
                    <td>{link(`tx/${e.txHash}`, short(e.txHash))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Where this page gets its numbers</h2>
        <div className="grid2">
          <div className="cmp">
            <h3>Envoyage subgraph · Subgraph Studio</h3>
            <p className="sub">Mandate scope, execution history, and the approval census</p>
            <p className="small muted" style={{marginBottom: 0}}>
              Also the keeper&rsquo;s work list: the bot asks this subgraph which mandates name
              it and which has gone longest without service. Remove it and the bot has nothing
              to do.
            </p>
          </div>
          <div className="cmp">
            <h3>Uniswap v4 subgraph · decentralized network</h3>
            <p className="sub">The size of the population the problem applies to</p>
            <p className="small muted" style={{marginBottom: 0}}>
              Uniswap&rsquo;s subgraph knows how many positions exist and who holds them, and has
              no concept of a permission scope — an approval carries none. Ours knows exactly
              what each keeper may do. Neither answers the question alone.
            </p>
          </div>
        </div>
        <p className="small muted" style={{marginBottom: 0}}>
          Contract state and refusal reasons still come straight from Sepolia over two
          independent RPC operators, so the page renders even if an indexer is behind.
        </p>
      </section>

      <footer>
        Composed from two Graph products plus direct chain reads. No backend.
        <br />
        <a href="https://github.com/envoyage-protocol/envoyage">github.com/envoyage-protocol/envoyage</a>
      </footer>
    </div>
  );
}
