import {useEffect, useState, type ReactNode} from "react";
import {formatUnits, parseAbiItem, type Address, type Hex} from "viem";
import {useSession} from "../lib/session";
import {CHAIN, DEMO_MANDATE_ID, ENVOYAGE, ENS_PARENT, ENS_RESOLVER, KEEPER_KEY} from "../lib/config";
import {publicClient, readCanCompound, readMandate, readPositionOwner, readEnsScope, REFUSAL_REASONS, type Mandate} from "../lib/envoyage";
import {fetchEnvoyage} from "../lib/graph";
import {compound, revoke, positionLiquidity, positionCurrencies} from "../lib/actions";
import {ActionButton, Outcome, Tx, Addr, Seal, Sponsor, short, type TxState} from "./kit";

const ZERO = "0x0000000000000000000000000000000000000000";
const SYMBOL = parseAbiItem("function symbol() view returns (string)");
const SET_TEXT = parseAbiItem("function setText(bytes32 node, string key, string value)");

type EnsScope = {node: string; records: Record<string, string>};

/// What the subgraph has said about this compound. `waiting` is polling; `indexed`
/// is the only state that renders a count, and the count is the one that was read
/// AFTER it rose above the baseline taken before the transaction was sent. A stale
/// count is never rendered as if it were current.
type GraphWatch =
  | {phase: "idle"}
  | {phase: "waiting"; baseline: number | null; since: number}
  | {phase: "indexed"; count: number; liquidityAdded: bigint | null; block: string; indexedBlock: number}
  | {phase: "timeout"; baseline: number | null};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/// Steps 2 and 3 of the story, on the live mandate. Compound: the bot does the one
/// thing it may. Revoke: the owner ends it, and the bot's next attempt dies with the
/// reason read from canCompound — a refusal the contract can only report through a
/// view, because a revert would discard the event that explained it.
///
/// `theftSide` is the right-hand column of step 2: the same bot sending the same
/// theft to Envoyage. It lives in Theft.tsx because it shares handlers with step 1.
export function KeeperActs({mandateId = DEMO_MANDATE_ID, theftSide}: {mandateId?: bigint; theftSide: ReactNode}) {
  const {client, account} = useSession();
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [reason, setReason] = useState<Hex | null>(null);
  const [liq, setLiq] = useState<bigint | null>(null);
  const [compState, setComp] = useState<TxState>({phase: "idle"});
  const [revState, setRev] = useState<TxState>({phase: "idle"});
  const [retryState, setRetry] = useState<TxState>({phase: "idle"});
  const [ensWrite, setEnsWrite] = useState<TxState>({phase: "idle"});

  // Uniswap: whose position, in which pool, approved to whom.
  const [pos, setPos] = useState<{owner: Address; approved: Address} | null>(null);
  const [pool, setPool] = useState<{sym0: string; sym1: string} | null>(null);

  // The Graph: baseline count before a compound; the watch after it.
  const [graphBaseline, setGraphBaseline] = useState<number | null>(null);
  const [graphBaselineBlock, setGraphBaselineBlock] = useState<number | null>(null);
  const [graph, setGraph] = useState<GraphWatch>({phase: "idle"});

  // ENS: the scope as it resolves right now, re-read after every action.
  const [ens, setEns] = useState<EnsScope | null>(null);
  const [ensReadAt, setEnsReadAt] = useState<"mount" | "compound" | "report" | "revoke">("mount");
  const [lastCompoundBlock, setLastCompoundBlock] = useState<bigint | null>(null);

  async function refresh() {
    const m = await readMandate(mandateId).catch(() => null);
    setMandate(m);
    setReason(await readCanCompound(mandateId).catch(() => null));
    if (m) setLiq(await positionLiquidity(m.tokenId).catch(() => null));
    return m;
  }

  async function rereadEns(tokenId: bigint, when: typeof ensReadAt) {
    const scope = await readEnsScope(tokenId).catch(() => null);
    if (scope) {
      setEns(scope);
      setEnsReadAt(when);
    }
    return scope;
  }

  async function readGraphCount(): Promise<number | null> {
    const d = await fetchEnvoyage().catch(() => null);
    const row = d?.mandates.find((r) => r.id === mandateId.toString());
    return row ? row.executionCount : null;
  }

  useEffect(() => {
    (async () => {
      const m = await refresh();
      if (!m) return;
      readPositionOwner(m.tokenId).then(setPos).catch(() => {});
      positionCurrencies(m.tokenId)
        .then(async ({currency0, currency1}) => {
          const [sym0, sym1] = await Promise.all(
            [currency0, currency1].map((a) =>
              publicClient.readContract({address: a, abi: [SYMBOL], functionName: "symbol"}).catch(() => short(a))
            )
          );
          setPool({sym0: sym0 as string, sym1: sym1 as string});
        })
        .catch(() => {});
      rereadEns(m.tokenId, "mount");
    })();
    fetchEnvoyage()
      .then((d) => {
        const row = d.mandates.find((r) => r.id === mandateId.toString());
        setGraphBaseline(row ? row.executionCount : null);
        setGraphBaselineBlock(d.indexedBlock);
      })
      .catch(() => {});
  }, [mandateId]);

  const allowed = reason === "0x00000000";
  const revoked = mandate?.keeper === ZERO;
  const approvedToEnvoyage = pos?.approved.toLowerCase() === ENVOYAGE.toLowerCase();
  const isKeeper = !!account && !!mandate && account.toLowerCase() === mandate.keeper.toLowerCase();

  /// Polls the subgraph until mandate N's executionCount rises above the baseline
  /// taken before the compound was sent, then reads the execution row by its tx hash.
  async function watchIndexer(hash: Hex, baseline: number | null) {
    const since = Date.now();
    setGraph({phase: "waiting", baseline, since});
    while (Date.now() - since < 60_000) {
      const d = await fetchEnvoyage().catch(() => null);
      if (d) {
        const row = d.mandates.find((r) => r.id === mandateId.toString());
        const ex = d.executions.find((e) => e.tx.toLowerCase() === hash.toLowerCase());
        const rose = row !== undefined && (baseline === null ? ex !== undefined : row.executionCount > baseline);
        if (row && rose) {
          setGraph({
            phase: "indexed",
            count: row.executionCount,
            liquidityAdded: ex ? BigInt(ex.liquidityAdded) : null,
            block: ex ? ex.block : `≤ ${d.indexedBlock}`,
            indexedBlock: d.indexedBlock
          });
          setGraphBaseline(row.executionCount);
          return;
        }
      }
      await sleep(5_000);
    }
    setGraph({phase: "timeout", baseline});
  }

  async function runCompound() {
    if (!client) return;
    setComp({phase: "running", note: "Compounding…"});
    setGraph({phase: "idle"});
    try {
      // Take the baseline NOW, not at mount: the count may have moved since.
      const baseline = (await readGraphCount()) ?? graphBaseline;
      const before = liq ?? (mandate ? await positionLiquidity(mandate.tokenId) : 0n);
      const hash = await compound(client, mandateId);
      const receipt = await publicClient.getTransactionReceipt({hash}).catch(() => null);
      if (receipt) setLastCompoundBlock(receipt.blockNumber);
      const after = mandate ? await positionLiquidity(mandate.tokenId) : before;
      setLiq(after);
      setComp({
        phase: "done",
        note: (
          <>
            Liquidity grew by <b>+{formatUnits(after - before, 18)}</b>, reinvested from harvested fees.
            The bot took only its capped share. <Tx hash={hash}>transaction</Tx>
          </>
        )
      });
      refresh();
      if (mandate) rereadEns(mandate.tokenId, "compound");
      watchIndexer(hash, baseline);
    } catch (e) {
      setComp({phase: "failed", note: <>{humanize(e)}</>});
    }
  }

  /// The bot reports its run into the one ENS record it holds a role for. Any other
  /// key from the same wallet reverts with EACUnauthorizedAccountRoles.
  async function runReportToEns() {
    if (!client || !ens || !mandate) return;
    const value = (lastCompoundBlock ?? (await publicClient.getBlockNumber())).toString();
    setEnsWrite({phase: "running", note: "Writing envoyage:lastRun…"});
    try {
      const {request} = await publicClient.simulateContract({
        account: client.account!,
        address: ENS_RESOLVER,
        abi: [SET_TEXT],
        functionName: "setText",
        args: [ens.node as Hex, KEEPER_KEY, value]
      });
      const hash = await client.writeContract({...request, chain: CHAIN});
      await publicClient.waitForTransactionReceipt({hash});
      setEnsWrite({phase: "done", note: <>Written: block {value}. <Tx hash={hash}>transaction</Tx></>});
      rereadEns(mandate.tokenId, "report");
    } catch (e) {
      setEnsWrite({phase: "failed", note: <>{humanize(e)}</>});
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
            Revoked, instantly. The bot's authority is gone — its next call now fails. <Tx hash={hash}>transaction</Tx>
          </>
        )
      });
      await refresh();
      if (mandate) rereadEns(mandate.tokenId, "revoke");
    } catch (e) {
      setRev({phase: "failed", note: <>{humanize(e)}</>});
    }
  }

  /// The bot's next attempt after the revoke. Expected to fail; the failure is the
  /// refusal reason, read from canCompound before anything is sent.
  async function runRetry() {
    if (!client) return;
    setRetry({phase: "running", note: "The bot tries again…"});
    try {
      const r = await readCanCompound(mandateId);
      setReason(r);
      if (r !== "0x00000000") {
        setRetry({
          phase: "failed",
          note: (
            <>
              Refused before it was sent: <b>{REFUSAL_REASONS[r] ?? `reason ${r}`}</b>. Read from{" "}
              <code className="mono">canCompound()</code>; a real send would revert with the same selector.
            </>
          )
        });
        return;
      }
      const hash = await compound(client, mandateId);
      setRetry({phase: "done", note: <>Unexpected: the compound went through. <Tx hash={hash}>inspect</Tx></>});
    } catch (e) {
      setRetry({phase: "failed", note: <>{humanize(e)}</>});
    }
  }

  const fmtDate = (t: bigint) => (t === 0n ? "—" : new Date(Number(t) * 1000).toISOString().slice(0, 10));
  const lastRun = ens?.records[KEEPER_KEY] ?? "";

  return (
    <>
      {/* ── step 2: the mandate ─────────────────────────────────────────── */}
      <section className="step" aria-labelledby="mandate-h">
        <header className="step-head">
          <span className="step-no" aria-hidden="true">
            2<small>The mandate</small>
          </span>
          <h2 id="mandate-h">
            The same bot, <em>two kinds of permission</em>
          </h2>
          <p>
            Now you give the bot a mandate instead of an approval. The position is approved to Envoyage, and
            Envoyage will do exactly one thing on the bot's request: compound. The bot's own address never holds
            an approval at all. Below, the bot does its job on the left and tries the theft on the right.
          </p>
        </header>

        <article className="sheet mandate-card" data-state={revoked ? "revoked" : "in-force"} aria-label={`Mandate ${mandateId}`}>
          {revoked && (
            <span className="stamp-revoked" aria-hidden="true">
              Revoked
            </span>
          )}
          <div className="docket">
            <span>
              <span className="caps">Mandate No. {mandateId.toString()}</span> · Sepolia
            </span>
            <span>{revoked ? "revoked by the owner" : mandate ? `in force until ${fmtDate(mandate.expiry)}` : "…"}</span>
          </div>

          <p className="position-line">
            Position <b className="num">#{mandate?.tokenId.toString() ?? "…"}</b> in the{" "}
            <b>{pool ? `${pool.sym0}/${pool.sym1}` : "…"}</b> pool, approved to{" "}
            {pos ? (
              approvedToEnvoyage ? (
                <>
                  <b>Envoyage</b> — not the bot
                </>
              ) : (
                <Addr addr={pos.approved} />
              )
            ) : (
              "…"
            )}
            .<Sponsor name="Uniswap" />
          </p>
          <p className="duel-sub" style={{margin: "0"}}>
            Owner {mandate ? <Addr addr={mandate.grantor} /> : "…"} · bot{" "}
            {mandate && !revoked ? <Addr addr={mandate.keeper} /> : mandate ? <span className="mono">none</span> : "…"} · fee cap{" "}
            {mandate ? `${(mandate.maxFeeBps / 100).toFixed(2)}%` : "…"} of harvested fees · at most once every{" "}
            {mandate ? mandate.minInterval.toString() : "…"}s. Read live from <Addr addr={ENVOYAGE} />.
          </p>

          <div className="keeper-status">
            <div>
              <span className="label">Position liquidity</span>
              <span className="value num">{liq === null ? "…" : formatUnits(liq, 18)}</span>
            </div>
            <div>
              <span className="label">Right now the bot</span>
              <span className="value">
                {reason === null ? "…" : allowed ? "may compound" : "may not act"}
                {reason && !allowed && <small>{REFUSAL_REASONS[reason] ?? `reason ${reason}`}</small>}
              </span>
            </div>
            <Seal
              off={!!revoked}
              centre={revoked ? "Revoked" : "In force"}
              rim={revoked ? `Envoyage · Sepolia · mandate ${mandateId} · revoked · ` : `Envoyage · Sepolia · mandate ${mandateId} · in force · `}
            />
          </div>
        </article>

        <div className="duel" style={{marginTop: 28}}>
          <article className="sheet duel-side">
            <div className="docket">
              <span className="caps">Same bot · its one power</span>
              <span>compound({mandateId.toString()})</span>
            </div>
            <h3>
              The bot compounds
              <span className="tag">Harvest the fees, put them back into the same position, keep a capped share.</span>
            </h3>
            <p className="duel-sub">
              {isKeeper
                ? "You are connected as this mandate's bot."
                : "Only the mandate's bot may call this; connect the keeper wallet to press it."}
            </p>
            <ActionButton label="Bot: compound now" tone="primary" state={compState} onClick={runCompound} disabled={!client || !!revoked} />
            <Outcome state={compState} />

            {graph.phase === "idle" && graphBaseline !== null && (
              <div className="report">
                <div className="report-head">
                  <span className="caps">Indexed by the Envoyage subgraph</span>
                  <Sponsor name="The Graph" />
                </div>
                <p className="line stale">
                  <b className="num">{graphBaseline}</b> executions of this mandate so far, as of block{" "}
                  <span className="num">{graphBaselineBlock}</span> — before any press here. After a compound this
                  panel polls until the count rises.
                </p>
              </div>
            )}
            {graph.phase !== "idle" && (
              <div className="report" role="status">
                <div className="report-head">
                  <span className="caps">Indexed by the Envoyage subgraph</span>
                  <Sponsor name="The Graph" />
                </div>
                {graph.phase === "waiting" && (
                  <p className="line waiting">
                    waiting for the indexer… (count was {graph.baseline ?? "unknown"} before the transaction; polling every 5s for up to 60s)
                  </p>
                )}
                {graph.phase === "indexed" && (
                  <p className="line">
                    execution <b className="num">{graph.count}</b>,{" "}
                    {graph.liquidityAdded !== null ? (
                      <>
                        <b className="num">+{formatUnits(graph.liquidityAdded, 18)}</b> liquidity,
                      </>
                    ) : (
                      "row not yet in the latest ten,"
                    )}{" "}
                    block <span className="num">{graph.block}</span> · subgraph at block <span className="num">{graph.indexedBlock}</span>
                  </p>
                )}
                {graph.phase === "timeout" && (
                  <p className="line stale">
                    The indexer did not report the new execution within 60s. The count before the transaction was{" "}
                    {graph.baseline ?? "unknown"}; no newer figure is shown because none was observed.
                  </p>
                )}
              </div>
            )}

            {ens && (compState.phase === "done" || ensWrite.phase !== "idle") && (
              <div className="report">
                <div className="report-head">
                  <span className="caps">
                    {mandate?.tokenId.toString()}.{ENS_PARENT}
                  </span>
                  <Sponsor name="ENS" />
                </div>
                <div className="rec written">
                  <span>{KEEPER_KEY}</span>
                  <span>
                    {lastRun || "(unset)"}
                    <span className="rec-note" style={{display: "block"}}>
                      the one ENS record the bot may write · resolved after the {ensReadAt}
                    </span>
                  </span>
                </div>
                <p className="line" style={{fontSize: 14}}>
                  The contract does not write this; the bot does, from its own wallet, and it holds a role for this
                  key alone. The same call aimed at <code className="mono">envoyage:maxFeeBps</code> reverts.
                </p>
                <div>
                  <ActionButton
                    label={`Bot: report this run to ${KEEPER_KEY}`}
                    tone="default"
                    state={ensWrite}
                    onClick={runReportToEns}
                    disabled={!client || !ens}
                  />
                  <Outcome state={ensWrite} />
                </div>
              </div>
            )}
          </article>

          {theftSide}
        </div>
      </section>

      {/* ── step 3: revoke ──────────────────────────────────────────────── */}
      <section className="step" aria-labelledby="revoke-h">
        <header className="step-head">
          <span className="step-no" aria-hidden="true">
            3<small>Revoke</small>
          </span>
          <h2 id="revoke-h">
            The owner ends it, <em>and the bot is told why</em>
          </h2>
          <p>
            One call from the owner. No unwinding, no waiting period. The bot's next attempt is refused, and the
            refusal comes with a reason, because a revert would discard the event that explained it.
          </p>
        </header>

        <article className="sheet">
          <div className="keeper-actions">
            <div>
              <span className="press-label" style={{display: "block", marginBottom: 10, fontSize: 14, color: "var(--ink-muted)"}}>
                <b style={{color: "var(--ink)"}}>As the owner</b> ({mandate ? short(mandate.grantor) : "…"}).
              </span>
              <ActionButton label="Owner: revoke this mandate" tone="default" state={revState} onClick={runRevoke} disabled={!client || !!revoked} />
              <Outcome state={revState} />
              {revoked && revState.phase === "idle" && (
                <p className="pending" style={{marginTop: 12}}>
                  Already revoked on chain. The seal above is cancelled and every clause is struck.
                </p>
              )}
            </div>
            <div>
              <span className="press-label" style={{display: "block", marginBottom: 10, fontSize: 14, color: "var(--ink-muted)"}}>
                <b style={{color: "var(--ink)"}}>As the bot</b>, afterwards.
              </span>
              <ActionButton label="Bot: try to compound again" tone="hostile" state={retryState} onClick={runRetry} disabled={!client} />
              <Outcome state={retryState} />
            </div>
          </div>

          {ens && (
            <div className="report" style={{marginTop: 24}}>
              <div className="report-head">
                <span className="caps">
                  {mandate?.tokenId.toString()}.{ENS_PARENT} still resolves
                </span>
                <Sponsor name="ENS" />
              </div>
              <p className="line" style={{fontSize: 14}}>
                {revoked
                  ? "The mandate is over, and the record of what was permitted survives it. Anyone can still read what this bot was allowed to do, without Envoyage."
                  : "What this bot is permitted to do, as any ENS client resolves it. After a revoke these records remain: the mandate ends, its record does not."}
                {ensReadAt === "revoke" && " Re-read after the revoke."}
              </p>
              {Object.entries(ens.records).map(([k, v]) => (
                <div key={k} className={k === KEEPER_KEY ? "rec written" : "rec"}>
                  <span>{k}</span>
                  <span>{v || <span className="pending">(unset)</span>}</span>
                </div>
              ))}
            </div>
          )}
          {!client && <p className="pending" style={{marginTop: 16}}>Connect a wallet to act.</p>}
        </article>
      </section>
    </>
  );
}

function humanize(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  for (const [sel, text] of Object.entries(REFUSAL_REASONS)) {
    if (sel !== "0x00000000" && s.includes(sel)) return text;
  }
  if (s.includes("EACUnauthorizedAccountRoles")) return "Refused by ENS: this wallet holds no role for that key.";
  const named = s.match(/reverted with the following reason:\s*([^\n]+)/);
  return named ? named[1] : s.split("\n")[0];
}
