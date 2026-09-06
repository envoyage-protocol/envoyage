import {useEffect, useState} from "react";
import {formatUnits, type Hex} from "viem";
import {ENVOYAGE, EXPLORER, DEMO_MANDATE_ID} from "./lib/config";
import {
  readMandate,
  readCanCompound,
  readPositionOwner,
  readExecutions,
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
      } catch (err) {
        // Surfaced rather than swallowed. An empty page that silently failed to read
        // the chain looks identical to a page with nothing to show.
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
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
        <h2>What the keeper actually did</h2>
        {execs.length === 0 && <p className="muted">No executions indexed yet.</p>}
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

      <footer>
        Read directly from Sepolia over two independent RPC operators — no indexer, no backend.
        <br />
        <a href="https://github.com/envoyage-protocol/envoyage">github.com/envoyage-protocol/envoyage</a>
      </footer>
    </div>
  );
}
