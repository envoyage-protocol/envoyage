import {useEffect, useState} from "react";
import {formatUnits, type Address} from "viem";
import {DEMO_POOL} from "../lib/config";
import {ownerOf, positionLiquidity, positionCurrencies} from "../lib/actions";
import {readActiveMandate} from "../lib/envoyage";
import {rememberedPositions, rememberPosition} from "./positions";
import {Sponsor} from "./kit";

export type PositionRow = {
  tokenId: bigint;
  state: "checking" | "ok" | "mandated" | "not-yours" | "wrong-pool" | "error";
  liquidity: bigint | null;
  mandateId: bigint | null;
  error?: string;
};

async function inspect(tokenId: bigint, account: Address): Promise<PositionRow> {
  try {
    const [owner, cur] = await Promise.all([ownerOf(tokenId), positionCurrencies(tokenId).catch(() => null)]);
    if (!owner) return {tokenId, state: "error", liquidity: null, mandateId: null, error: "No such position."};
    if (owner.toLowerCase() !== account.toLowerCase()) return {tokenId, state: "not-yours", liquidity: null, mandateId: null};
    const inPool =
      !!cur &&
      cur.currency0.toLowerCase() === DEMO_POOL.currency0.toLowerCase() &&
      cur.currency1.toLowerCase() === DEMO_POOL.currency1.toLowerCase();
    if (!inPool) return {tokenId, state: "wrong-pool", liquidity: null, mandateId: null};
    const [liq, active] = await Promise.all([positionLiquidity(tokenId), readActiveMandate(tokenId)]);
    return {tokenId, state: active !== 0n ? "mandated" : "ok", liquidity: liq, mandateId: active !== 0n ? active : null};
  } catch (e) {
    return {tokenId, state: "error", liquidity: null, mandateId: null, error: e instanceof Error ? e.message.split("\n")[0] : String(e)};
  }
}

/// Rows from the helper's memory plus a paste field; each validated on chain
/// (owner, pool key, active mandate). Mandated rows are badged and unselectable;
/// the first eligible row is pre-selected.
export function PositionPicker({
  account,
  selected,
  onSelect,
  extra
}: {
  account: Address;
  selected: bigint | null;
  onSelect: (id: bigint | null) => void;
  /// a freshly minted id to add (from Get a demo position)
  extra?: bigint | null;
}) {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [paste, setPaste] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);

  async function add(tokenId: bigint, select: boolean) {
    setRows((r) => (r.some((x) => x.tokenId === tokenId) ? r : [...r, {tokenId, state: "checking", liquidity: null, mandateId: null}]));
    const row = await inspect(tokenId, account);
    setRows((r) => r.map((x) => (x.tokenId === tokenId ? row : x)));
    if (row.state === "ok") {
      rememberPosition(account, tokenId);
      if (select) onSelect(tokenId);
    }
  }

  useEffect(() => {
    setRows([]);
    onSelect(null);
    const ids = rememberedPositions(account);
    (async () => {
      let picked = false;
      for (const id of ids) {
        const row = await inspect(id, account);
        setRows((r) => [...r.filter((x) => x.tokenId !== id), row].sort((a, b) => (a.tokenId < b.tokenId ? -1 : 1)));
        if (row.state === "ok" && !picked) {
          picked = true;
          onSelect(id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => {
    if (extra !== null && extra !== undefined) add(extra, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra]);

  function submitPaste() {
    setPasteErr(null);
    const t = paste.trim();
    if (!/^\d+$/.test(t)) {
      setPasteErr("A position is its number on the PositionManager, e.g. 38896.");
      return;
    }
    add(BigInt(t), true);
    setPaste("");
  }

  return (
    <div className="picker">
      {rows.length === 0 && <p className="pending">No positions remembered for this wallet yet. Paste a token id, or mint a demo position above.</p>}
      {rows.length > 0 && (
        <table className="ledger" style={{minWidth: 0}}>
          <caption className="visually-hidden">Your positions in the demo pool</caption>
          <thead>
            <tr>
              <th scope="col">Position</th>
              <th scope="col">Pool</th>
              <th scope="col">Liquidity</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const eligible = r.state === "ok";
              return (
                <tr key={r.tokenId.toString()} className={selected === r.tokenId ? "picked" : undefined}>
                  <td>
                    <label style={{display: "inline-flex", gap: 8, alignItems: "center"}}>
                      <input
                        type="radio"
                        name="position"
                        checked={selected === r.tokenId}
                        disabled={!eligible}
                        onChange={() => onSelect(r.tokenId)}
                        aria-label={`Position ${r.tokenId}`}
                      />
                      <span className="num">#{r.tokenId.toString()}</span>
                    </label>
                  </td>
                  <td>EDB/EDA <Sponsor name="Uniswap" /></td>
                  <td className="num">{r.liquidity === null ? "…" : Number(formatUnits(r.liquidity, 18)).toFixed(4)}</td>
                  <td>
                    {r.state === "checking" && <span className="pending">checking…</span>}
                    {r.state === "ok" && "eligible"}
                    {r.state === "mandated" && <span className="badge">already mandated (No. {r.mandateId?.toString()}) — see My mandates</span>}
                    {r.state === "not-yours" && "not owned by this wallet"}
                    {r.state === "wrong-pool" && "not in the demo pool"}
                    {r.state === "error" && <span className="gate-refused">{r.error}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="paste" style={{marginTop: 14}}>
        <label htmlFor="paste-id" className="label" style={{display: "block", fontSize: 14, color: "var(--ink-muted)"}}>
          Have a position already? Paste its token id
        </label>
        <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6}}>
          <input
            id="paste-id"
            className="field"
            inputMode="numeric"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitPaste()}
            placeholder="38896"
          />
          <button className="act act-ghost sm" onClick={submitPaste} disabled={!paste.trim()}>
            Check
          </button>
        </div>
        {pasteErr && <p className="gate gate-refused">{pasteErr}</p>}
      </div>
    </div>
  );
}
