import {useEffect, useState} from "react";
import type {Address} from "viem";
import {useSession} from "../lib/session";
import {fetchMandatesByGrantor, type AppMandate} from "../lib/graph";
import {MandateRow} from "./MandateRow";
import {short} from "./kit";

/// Every mandate the connected wallet granted, from the subgraph. Each row then
/// reads the chain on its own.
export function MyMandates({go}: {go: (r: string) => void}) {
  const {account} = useSession();
  const [rows, setRows] = useState<AppMandate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!account) return;
    setRows(null);
    setError(null);
    fetchMandatesByGrantor(account)
      .then((d) => setRows(d.mandates))
      .catch((e) => setError(e instanceof Error ? e.message.split("\n")[0] : String(e)));
  }, [account, tick]);

  return (
    <section className="exhibit" aria-labelledby="mm-h">
      <div className="exhibit-head">
        <span className="caps">My mandates</span>
        <h2 id="mm-h">What your bot may do, and what it did</h2>
        <p>
          Mandates granted by <span className="mono">{short(account as Address)}</span>, from the Envoyage subgraph. Status and pre-flight are read
          from the contract on every row.
        </p>
      </div>

      {rows === null && !error && <p className="pending">Loading your mandates from the subgraph…</p>}
      {error && (
        <div className="error" role="alert">
          <b>Subgraph query failed.</b>
          <span>
            The list is withheld rather than shown empty. <code>{error}</code>{" "}
            <button className="act act-ghost sm" onClick={() => setTick((t) => t + 1)}>
              Retry
            </button>
          </span>
        </div>
      )}
      {rows !== null && rows.length === 0 && (
        <p className="pending">
          This wallet has granted no mandates yet.{" "}
          <button className="act act-primary sm" onClick={() => go("hire")}>
            Hire a keeper
          </button>
        </p>
      )}
      {rows !== null && rows.length > 0 && (
        <div className="rows">
          {rows.map((r) => (
            <MandateRow key={r.mandateId} row={r} go={go} />
          ))}
        </div>
      )}
    </section>
  );
}
