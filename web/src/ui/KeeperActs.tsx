import {useEffect, useState} from "react";
import {formatUnits, type Hex} from "viem";
import {useSession} from "../lib/session";
import {DEMO_MANDATE_ID} from "../lib/config";
import {readCanCompound, readMandate, REFUSAL_REASONS, type Mandate} from "../lib/envoyage";
import {compound, revoke, positionLiquidity} from "../lib/actions";
import {ActionButton, Outcome, Tx, type TxState} from "./kit";

/// Act two and act four, on the live mandate. Compound: the keeper does the one thing
/// it may. Revoke: the owner ends it, and the keeper's next attempt dies with the
/// reason read from canCompound — a refusal the contract can only report through a
/// view, because a revert would discard the event that explained it.
export function KeeperActs({mandateId = DEMO_MANDATE_ID}: {mandateId?: bigint}) {
  const {client} = useSession();
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [reason, setReason] = useState<Hex | null>(null);
  const [liq, setLiq] = useState<bigint | null>(null);
  const [compState, setComp] = useState<TxState>({phase: "idle"});
  const [revState, setRev] = useState<TxState>({phase: "idle"});

  async function refresh() {
    const m = await readMandate(mandateId).catch(() => null);
    setMandate(m);
    setReason(await readCanCompound(mandateId).catch(() => null));
    if (m) setLiq(await positionLiquidity(m.tokenId).catch(() => null));
  }
  useEffect(() => {
    refresh();
  }, [mandateId]);

  const allowed = reason === "0x00000000";
  const revoked = mandate?.keeper === "0x0000000000000000000000000000000000000000";

  async function runCompound() {
    if (!client) return;
    setComp({phase: "running", note: "Compounding…"});
    try {
      const before = liq ?? (mandate ? await positionLiquidity(mandate.tokenId) : 0n);
      const hash = await compound(client, mandateId);
      const after = mandate ? await positionLiquidity(mandate.tokenId) : before;
      setLiq(after);
      setComp({
        phase: "done",
        note: (
          <>
            Liquidity grew by <b>+{formatUnits(after - before, 18)}</b>, reinvested from harvested fees.
            The keeper took only its capped share. <Tx hash={hash}>transaction</Tx>
          </>
        )
      });
      refresh();
    } catch (e) {
      setComp({phase: "failed", note: <>{humanize(e)}</>});
    }
  }

  async function runRevoke() {
    if (!client) return;
    setRev({phase: "running", note: "Revoking…"});
    try {
      const hash = await revoke(client, mandateId);
      setRev({
        phase: "done",
        note: (
          <>
            Revoked, instantly. The keeper's authority is gone — its next call now fails. <Tx hash={hash}>transaction</Tx>
          </>
        )
      });
      refresh();
    } catch (e) {
      setRev({phase: "failed", note: <>{humanize(e)}</>});
    }
  }

  return (
    <section className="act-panel" aria-labelledby="keeper-h">
      <header className="act-head">
        <span className="act-role">Exhibit E · The keeper does its job, then the owner ends it</span>
        <h2 id="keeper-h">Compound, then revoke</h2>
        <p>Mandate No. {mandateId.toString()}, live on Sepolia. Switch to the keeper wallet to compound; to the owner wallet to revoke.</p>
      </header>

      <article className="sheet">
        <div className="docket">
          <span className="caps">Mandate No. {mandateId.toString()}</span>
          <span>{revoked ? "revoked" : mandate ? "in force" : "…"}</span>
        </div>
        <div className="keeper-status">
          <div>
            <span className="label">Position liquidity</span>
            <span className="value num">{liq === null ? "…" : formatUnits(liq, 18)}</span>
          </div>
          <div>
            <span className="label">Right now the attorney-in-fact</span>
            <span className="value">
              {reason === null ? "…" : allowed ? "may act" : "may not act"}
              {reason && !allowed && <small>{REFUSAL_REASONS[reason] ?? `reason ${reason}`}</small>}
            </span>
          </div>
        </div>

        <div className="keeper-actions">
          <div>
            <ActionButton label="Compound now (as the keeper)" tone="primary" state={compState} onClick={runCompound} disabled={!client || revoked} />
            <Outcome state={compState} />
          </div>
          <div>
            <ActionButton label="Revoke this mandate (as the owner)" tone="default" state={revState} onClick={runRevoke} disabled={!client || revoked} />
            <Outcome state={revState} />
          </div>
        </div>
        {!client && <p className="pending" style={{marginTop: 16}}>Connect a wallet to act.</p>}
      </article>
    </section>
  );
}

function humanize(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  for (const [sel, text] of Object.entries(REFUSAL_REASONS)) {
    if (sel !== "0x00000000" && s.includes(sel)) return text;
  }
  const named = s.match(/reverted with the following reason:\s*([^\n]+)/);
  return named ? named[1] : s.split("\n")[0];
}
