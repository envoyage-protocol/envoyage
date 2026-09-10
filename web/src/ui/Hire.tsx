import {useEffect, useMemo, useState} from "react";
import {formatEther, type Address} from "viem";
import {useSession} from "../lib/session";
import {ENVOYAGE, ENS_PARENT, REFERENCE_KEEPER, EXPLORER} from "../lib/config";
import {publicClient, readNameOwner, readActiveMandate, readPositionOwner} from "../lib/envoyage";
import {fetchMandatesByPosition} from "../lib/graph";
import {approvePosition, grant, publishName, retireName} from "../lib/actions";
import {StepRunner, useStepRunner, type Step} from "./StepRunner";
import {PositionPicker} from "./PositionPicker";
import {MandatePreview} from "./MandatePreview";
import {GetDemoPosition} from "./GetDemoPosition";
import {planHireSteps, stepSatisfied, validateTerms, type HireFacts, type HireStepId} from "./hireSteps";
import {Sponsor, Tx, short} from "./kit";

const GAS: Record<HireStepId, bigint> = {retire: 120_000n, approve: 60_000n, grant: 220_000n, publish: 900_000n};

async function readFacts(tokenId: bigint): Promise<HireFacts> {
  const [{approved}, active, nameOwner] = await Promise.all([readPositionOwner(tokenId), readActiveMandate(tokenId), readNameOwner(tokenId)]);
  let previous: HireFacts["previous"] = null;
  try {
    const {mandates} = await fetchMandatesByPosition(tokenId);
    if (mandates[0]) previous = {id: BigInt(mandates[0].mandateId), status: mandates[0].status as "ACTIVE" | "REVOKED"};
  } catch {
    // The subgraph being down only costs the retire heuristic; publish will say
    // so itself if the label is taken.
  }
  return {approvedTo: approved, activeMandate: active, nameOwner, previous};
}

/// Owner hires the reference bot: pick a position (or mint one), set terms, read
/// the instrument, sign approve → grant → publish (retire inserted when needed).
export function Hire({go}: {go: (r: string) => void}) {
  const {client, account, onSepolia} = useSession();
  const acct = account as Address;

  const [selected, setSelected] = useState<bigint | null>(null);
  const [justMinted, setJustMinted] = useState<bigint | null>(null);
  const [showMint, setShowMint] = useState(false);
  const [feeCap, setFeeCap] = useState("2");
  const [cooldown, setCooldown] = useState("5");
  const [expiryDays, setExpiryDays] = useState("30");
  const [facts, setFacts] = useState<HireFacts | null>(null);
  const [factsErr, setFactsErr] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{pending: number; cost: bigint; balance: bigint} | null>(null);
  const [mandateId, setMandateId] = useState<bigint | null>(null);
  const [done, setDone] = useState(false);

  const terms = validateTerms({feeCapPercent: Number(feeCap), cooldownMinutes: Number(cooldown), expiryDays: Number(expiryDays)});

  async function loadFacts(id: bigint) {
    setFacts(null);
    setFactsErr(null);
    try {
      setFacts(await readFacts(id));
    } catch (e) {
      setFactsErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }
  useEffect(() => {
    setDone(false);
    setMandateId(null);
    if (selected !== null) loadFacts(selected);
  }, [selected]);

  const plan = facts ? planHireSteps(facts) : [];

  const steps = useMemo<Step[]>(() => {
    if (!client || !account || selected === null || !facts || !terms.ok) return [];
    const tokenId = selected;
    const fresh = () => readFacts(tokenId);
    const build = (id: HireStepId): Step => {
      switch (id) {
        case "retire":
          return {
            id: "retire",
            label: `Retire the old name ${tokenId}.${ENS_PARENT} (its mandate No. ${facts.previous?.id} was revoked)`,
            isDone: async () => stepSatisfied("retire", await fresh(), ENVOYAGE, acct),
            run: () => retireName(client, facts.previous!.id, tokenId)
          };
        case "approve":
          return {
            id: "approve",
            label: "Approve the position to Envoyage — the contract, never the bot",
            isDone: async () => stepSatisfied("approve", await fresh(), ENVOYAGE, acct),
            run: () => approvePosition(client, tokenId, ENVOYAGE)
          };
        case "grant":
          return {
            id: "grant",
            label: "Grant the mandate with these terms",
            isDone: async () => {
              const f = await fresh();
              if (f.activeMandate !== 0n) setMandateId(f.activeMandate);
              return stepSatisfied("grant", f, ENVOYAGE, acct);
            },
            run: async () => {
              const r = await grant(client, {
                keeper: REFERENCE_KEEPER,
                tokenId,
                maxFeeBps: terms.maxFeeBps,
                feeRecipient: REFERENCE_KEEPER,
                minInterval: terms.minInterval,
                expiry: terms.expiry
              });
              setMandateId(r.mandateId);
              return r.hash;
            }
          };
        case "publish":
          return {
            id: "publish",
            label: `Publish ${tokenId}.${ENS_PARENT} with the scope as ENS text records`,
            isDone: async () => stepSatisfied("publish", await fresh(), ENVOYAGE, acct),
            run: async () => {
              const id = mandateId ?? (await readActiveMandate(tokenId));
              if (id === 0n) throw new Error("No live mandate to publish: the grant step has not landed.");
              return publishName(client, id);
            }
          };
      }
    };
    return plan.map(build);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, account, selected, facts, terms.ok && `${terms.maxFeeBps}|${terms.minInterval}|${terms.expiry}`, plan.join(), mandateId]);

  const runner = useStepRunner(steps, {account, onComplete: () => setDone(true)});

  // Pre-signature estimate for the pending steps at current gas.
  useEffect(() => {
    if (!facts || !account || steps.length === 0) return;
    (async () => {
      try {
        const pending = plan.filter((id) => !stepSatisfied(id, facts, ENVOYAGE, acct));
        const gas = pending.reduce((a, id) => a + GAS[id], 0n);
        const [price, balance] = await Promise.all([publicClient.getGasPrice(), publicClient.getBalance({address: acct})]);
        setEstimate({pending: pending.length, cost: gas * price, balance});
      } catch {
        setEstimate(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts, account, plan.join()]);

  const previewTerms = {
    tokenId: selected,
    keeper: REFERENCE_KEEPER,
    feeRecipient: REFERENCE_KEEPER,
    maxFeeBps: terms.ok ? terms.maxFeeBps : 0,
    minInterval: terms.ok ? terms.minInterval : 0n,
    expiry: terms.ok ? terms.expiry : 0n,
    compoundAllowed: true
  };

  if (done && selected !== null) {
    return (
      <section className="exhibit" aria-labelledby="done-h">
        <div className="exhibit-head">
          <span className="caps">Hired</span>
          <h2 id="done-h">The bot is working for you</h2>
          <p>
            Mandate <b className="num">No. {mandateId?.toString() ?? "…"}</b> is in force on position #{selected.toString()}. Its scope is
            published as <b>{selected.toString()}.{ENS_PARENT}</b> <Sponsor name="ENS" /> and the bot's task list comes from the subgraph{" "}
            <Sponsor name="The Graph" />.
          </p>
        </div>
        <MandatePreview terms={previewTerms} status="in-force" mandateId={mandateId} />
        <p style={{marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap"}}>
          <button className="act act-primary" onClick={() => go("mandates")}>
            Watch it in My mandates
          </button>
          <button className="act act-ghost" onClick={() => go("lookup")}>
            Look the name up
          </button>
        </p>
      </section>
    );
  }

  return (
    <div className="hire">
      <section className="exhibit" aria-labelledby="hire-h">
        <div className="exhibit-head">
          <span className="caps">Hire a keeper</span>
          <h2 id="hire-h">Let the bot compound one position, and nothing else</h2>
          <p>
            Connected as <span className="mono">{short(acct)}</span>. The bot is Envoyage's reference keeper; you set the position, the
            fee cap, the cooldown and the expiry. Three signatures: approve the position to Envoyage, grant the mandate, publish its name.
          </p>
        </div>

        <article className="sheet">
          <div className="docket">
            <span className="caps">1 · Position</span>
            <span>
              <button className="act act-ghost sm" onClick={() => setShowMint((v) => !v)}>
                {showMint ? "Hide" : "No position? Get a demo position"}
              </button>
            </span>
          </div>
          {showMint && (
            <div style={{marginBottom: 20}}>
              <GetDemoPosition
                onMinted={(id) => {
                  setJustMinted(id);
                  setShowMint(false);
                }}
              />
            </div>
          )}
          <PositionPicker account={acct} selected={selected} onSelect={setSelected} extra={justMinted} />
        </article>

        <article className="sheet" style={{marginTop: 24}}>
          <div className="docket">
            <span className="caps">2 · Terms</span>
            <span>
              keeper <a className="mono" href={`${EXPLORER}/address/${REFERENCE_KEEPER}`} target="_blank" rel="noreferrer">{short(REFERENCE_KEEPER)}</a> · read-only in v0
            </span>
          </div>
          <div className="terms">
            <label>
              <span>Fee cap, % of harvested fees</span>
              <input className="field" inputMode="decimal" value={feeCap} onChange={(e) => setFeeCap(e.target.value)} aria-describedby="fee-help" />
              <small id="fee-help">Default 2%. The contract's hard maximum is 10%.</small>
            </label>
            <label>
              <span>Cooldown between compounds, minutes</span>
              <input className="field" inputMode="numeric" value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
              <small>Default 5. The first compound is exempt. 0 is allowed.</small>
            </label>
            <label>
              <span>Expiry, days from now</span>
              <input className="field" inputMode="numeric" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
              <small>Default 30. You can revoke at any time before that.</small>
            </label>
          </div>
          {!terms.ok && <p className="gate gate-refused">{terms.reason}</p>}
          <p className="foot-note">
            Fee recipient is the keeper's own address and compounding is the only permitted action; both are shown below and neither is editable in v0.
          </p>
        </article>

        <div style={{marginTop: 24}}>
          <MandatePreview terms={previewTerms} status="draft" />
        </div>

        <article className="sheet" style={{marginTop: 24}}>
          <div className="docket">
            <span className="caps">3 · Sign</span>
            <span>{selected === null ? "choose a position first" : `position #${selected.toString()}`}</span>
          </div>
          {selected !== null && !facts && !factsErr && <p className="pending">Reading the position's approval, mandate and name…</p>}
          {factsErr && (
            <p className="gate gate-refused">
              Could not read the position: {factsErr}{" "}
              <button className="act act-ghost sm" onClick={() => loadFacts(selected!)}>
                Retry
              </button>
            </p>
          )}
          {facts && plan.includes("retire") && (
            <p className="gate">
              This position's name is still registered from mandate No. {facts.previous?.id.toString()}, which was revoked. The old name will be
              retired first and replaced by this mandate's.
            </p>
          )}
          {facts && facts.activeMandate !== 0n && (
            <p className="gate">
              Mandate No. {facts.activeMandate.toString()} is already live on this position. Only the unfinished steps will run.
            </p>
          )}
          {estimate && !runner.running && (
            <p className="gate">
              {estimate.pending} signature{estimate.pending === 1 ? "" : "s"} pending, about {Number(formatEther(estimate.cost)).toFixed(4)} ETH in gas at the
              current price.
              {estimate.balance < estimate.cost && (
                <span className="gate-refused" style={{display: "block", marginTop: 6}}>
                  This wallet holds {Number(formatEther(estimate.balance)).toFixed(4)} ETH, less than the estimate.
                </span>
              )}
            </p>
          )}
          {steps.length > 0 && <StepRunner steps={steps} state={runner} />}
          <div style={{marginTop: 16}}>
            <button className="act act-primary" onClick={runner.start} disabled={steps.length === 0 || runner.running || !terms.ok || !onSepolia}>
              {runner.running ? "Working…" : "Hire the bot"}
            </button>
            {runner.complete && steps.length > 0 && !done && (
              <span className="gate" style={{marginLeft: 12}}>
                Every step is satisfied.{" "}
                <button className="act act-ghost sm" onClick={() => setDone(true)}>
                  Continue
                </button>
              </span>
            )}
            {mandateId !== null && !done && (
              <span className="gate" style={{display: "block"}}>
                Mandate No. {mandateId.toString()} granted{runner.statuses.find((s) => s.phase === "done" && s.hash) ? <> · <Tx hash={(runner.statuses.find((s) => s.phase === "done" && s.hash) as {hash: `0x${string}`}).hash}>transaction</Tx></> : null}.
              </span>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
