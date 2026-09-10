import {useEffect, useMemo, useState} from "react";
import {formatEther, type Address} from "viem";
import {useSession} from "../lib/session";
import {DEMO_POOL, DEMO_MINT_LIQUIDITY, PERMIT2} from "../lib/config";
import {publicClient} from "../lib/envoyage";
import {
  mintDemoTokens,
  approveTokenToPermit2,
  approvePermit2ToPosm,
  mintDemoPosition,
  erc20Balance,
  erc20Allowance,
  permit2Allowance,
  currentTick
} from "../lib/actions";
import {StepRunner, useStepRunner, type Step} from "./StepRunner";
import {rememberPosition} from "./positions";
import {Sponsor} from "./kit";

/// Enough of each token for the mint with margin: a 100e18-liquidity position over
/// ±2000 ticks needs about 9.5e18 of each side.
const ENOUGH = DEMO_MINT_LIQUIDITY / 4n;
/// Rough gas per step, for the pre-signature estimate.
const GAS: Record<string, bigint> = {mint: 60_000n, approve: 50_000n, permit2: 60_000n, position: 450_000n};

/// The guided seven-step mint: token A, token B, each approved to Permit2, each
/// approved through Permit2 to the PositionManager, then the position — centred
/// on the pool's current tick. Satisfied steps are skipped.
export function GetDemoPosition({onMinted}: {onMinted: (tokenId: bigint) => void}) {
  const {client, account, onSepolia} = useSession();
  const [minted, setMinted] = useState<{tokenId: bigint; tickLower: number; tickUpper: number} | null>(null);
  const [estimate, setEstimate] = useState<{pending: number; cost: bigint; balance: bigint; tick: number} | null>(null);
  const [estimateErr, setEstimateErr] = useState<string | null>(null);

  const acct = account as Address;
  const steps = useMemo<Step[]>(() => {
    if (!client || !account) return [];
    const tok = (i: 0 | 1) => (i === 0 ? DEMO_POOL.currency0 : DEMO_POOL.currency1);
    const sym = (i: 0 | 1) => (i === 0 ? "EDB" : "EDA");
    const out: Step[] = [];
    for (const i of [0, 1] as const) {
      out.push({
        id: `mint-${i}`,
        label: `Mint demo token ${sym(i)} to your wallet`,
        isDone: async () => (await erc20Balance(tok(i), acct)) >= ENOUGH,
        run: () => mintDemoTokens(client, tok(i))
      });
    }
    for (const i of [0, 1] as const) {
      out.push({
        id: `permit2-token-${i}`,
        label: `Approve ${sym(i)} to Permit2`,
        isDone: async () => (await erc20Allowance(tok(i), acct, PERMIT2)) >= ENOUGH,
        run: () => approveTokenToPermit2(client, tok(i))
      });
    }
    for (const i of [0, 1] as const) {
      out.push({
        id: `permit2-posm-${i}`,
        label: `Let the PositionManager draw ${sym(i)} through Permit2`,
        isDone: async () => {
          const a = await permit2Allowance(acct, tok(i));
          return a.amount >= ENOUGH && a.expiration > Math.floor(Date.now() / 1000);
        },
        run: () => approvePermit2ToPosm(client, tok(i))
      });
    }
    out.push({
      id: "position",
      label: "Mint the position, centred on the pool's current price",
      isDone: async () => false,
      run: async () => {
        const r = await mintDemoPosition(client);
        rememberPosition(acct, r.tokenId);
        setMinted(r);
        return r.hash;
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, account]);

  const runner = useStepRunner(steps, {
    account,
    onComplete: () => {
      /* completion is announced from `minted`, set inside the last step */
    }
  });

  useEffect(() => {
    if (minted) onMinted(minted.tokenId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minted]);

  // Prompt count and cost, stated before the first signature.
  useEffect(() => {
    if (!account || steps.length === 0) return;
    (async () => {
      try {
        const done = await Promise.all(steps.map((s) => s.isDone().catch(() => false)));
        const pending = steps.filter((_, i) => !done[i]);
        const gas = pending.reduce((a, s) => a + (s.id === "position" ? GAS.position : s.id.startsWith("mint") ? GAS.mint : s.id.startsWith("permit2-posm") ? GAS.permit2 : GAS.approve), 0n);
        const [price, balance, {tick}] = await Promise.all([publicClient.getGasPrice(), publicClient.getBalance({address: acct}), currentTick()]);
        setEstimate({pending: pending.length, cost: gas * price, balance, tick});
      } catch (e) {
        setEstimateErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, steps, runner.complete]);

  if (!client || !account) return null;

  return (
    <div className="demo-position">
      {estimate && !runner.running && !minted && (
        <p className="gate" style={{marginBottom: 12}}>
          {estimate.pending === 0
            ? "Everything but the mint is already in place."
            : `${estimate.pending} wallet prompt${estimate.pending === 1 ? "" : "s"}, about ${Number(formatEther(estimate.cost)).toFixed(4)} ETH in gas at the current price.`}{" "}
          Pool tick right now: <span className="num">{estimate.tick}</span>; the position will be centred there.{" "}
          <Sponsor name="Uniswap" />
          {estimate.balance < estimate.cost && (
            <span className="gate-refused" style={{display: "block", marginTop: 6}}>
              This wallet holds {Number(formatEther(estimate.balance)).toFixed(4)} ETH, less than the estimate. Top up from a Sepolia faucet first.
            </span>
          )}
        </p>
      )}
      {estimateErr && <p className="gate gate-refused">Could not estimate: {estimateErr}</p>}

      <StepRunner steps={steps} state={runner} />

      {!minted && (
        <div style={{marginTop: 14}}>
          <button className="act act-primary" onClick={runner.start} disabled={runner.running || !onSepolia}>
            {runner.running ? "Working…" : "Get a demo position"}
          </button>
        </div>
      )}
      {minted && (
        <p className="outcome outcome-ok" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            Position <b className="num">#{minted.tokenId.toString()}</b> minted in the EDB/EDA pool, ticks {minted.tickLower} to {minted.tickUpper}. It is selected below.
          </span>
        </p>
      )}
    </div>
  );
}
