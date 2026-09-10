import {toFunctionSelector, type Address, type Hex} from "viem";
import {envoyageAbi, type Mandate} from "../lib/envoyage";

/// Every custom error on Envoyage's ABI, keyed by the selector DERIVED from its
/// signature at runtime. Nothing here is written down as hex: a hard-coded selector
/// that is wrong shows no error, it just falls through to "unknown" while the
/// contract is behaving correctly — which is exactly the bug this file fixes.
export const ERROR_BY_SELECTOR: Record<string, string> = Object.fromEntries(
  (envoyageAbi as readonly {type: string; name?: string; inputs?: readonly {type: string}[]}[])
    .filter((e) => e.type === "error")
    .map((e) => {
      const sig = `${e.name}(${(e.inputs ?? []).map((i) => i.type).join(",")})`;
      return [toFunctionSelector(sig).toLowerCase(), e.name ?? "?"];
    })
);
export const SELECTOR_BY_ERROR: Record<string, Hex> = Object.fromEntries(
  Object.entries(ERROR_BY_SELECTOR).map(([sel, name]) => [name, sel as Hex])
);

export type RevertContext = {mandate?: Mandate | null; now?: number};

const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

/// Maps an error NAME to a sentence a viewer can act on.
export function explainError(name: string, ctx: RevertContext = {}): string {
  const m = ctx.mandate ?? null;
  const now = ctx.now ?? Math.floor(Date.now() / 1000);
  switch (name) {
    case "NotKeeper":
      return `This wallet is not the mandate keeper${m ? ` (${short(m.keeper)})` : ""}. Switch accounts.`;
    case "ZeroLiquidityDelta":
      return "No fees have accrued since the last compound — nothing to reinvest yet.";
    case "FeeBelowMinimum":
      return "The fees harvested would be below the minimum the keeper asked for; try again when more has accrued.";
    case "CooldownActive": {
      if (m) {
        const remaining = Number(m.lastCall + m.minInterval) - now;
        if (remaining > 0) return `Cooldown active: the mandate allows one call every ${m.minInterval}s, and ${remaining}s remain.`;
      }
      return "Cooldown active: the mandate's minimum interval since the last call has not elapsed.";
    }
    case "MandateExpired":
      return `The mandate has expired${m ? ` (on ${new Date(Number(m.expiry) * 1000).toISOString().slice(0, 10)})` : ""}. The bot may no longer act.`;
    case "OwnerChanged":
      return "The position changed hands since the mandate was granted; it no longer applies.";
    case "MandateInactive":
      return "No such mandate, or it has been revoked.";
    case "CompoundNotAllowed":
      return "This mandate does not permit compounding.";
    case "NotPositionOwner":
      return `This wallet does not own the position${m ? `; the owner is ${short(m.grantor)}` : ""}. Switch accounts.`;
    case "FeeCapTooHigh":
      return "The fee cap requested is above the protocol's maximum.";
    case "MandateAlreadyActive":
      return "An active mandate already exists for this position; revoke it first.";
    case "Reentrancy":
      return "Re-entrant call refused.";
    case "ResidualBalance":
      return "Refused: Envoyage would have been left holding tokens after the call. It must hold zero.";
    case "TransferFailed":
      return "A token transfer inside the call failed.";
    default:
      return `Reverted with ${name}.`;
  }
}

/// Finds the revert selector in whatever viem threw. viem nests the useful part
/// several `cause`s down: a ContractFunctionRevertedError carries `data.errorName`
/// when the error is on the ABI, `raw` / `data` hex when it is not, and the message
/// often quotes the selector as well. Every layer is searched before giving up.
export function revertSelector(e: unknown): {selector: Hex | null; name: string | null} {
  const seen = new Set<unknown>();
  let cur: any = e;
  let selector: Hex | null = null;
  let name: string | null = null;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const d = cur.data;
    if (d && typeof d === "object" && typeof d.errorName === "string" && !name) name = d.errorName;
    for (const candidate of [cur.raw, cur.signature, typeof d === "string" ? d : undefined, d?.data]) {
      if (typeof candidate === "string" && /^0x[0-9a-f]{8}/i.test(candidate) && !selector) {
        selector = candidate.slice(0, 10).toLowerCase() as Hex;
      }
    }
    if (!selector && typeof cur.message === "string") {
      const hit = cur.message.match(/0x[0-9a-fA-F]{8}\b/);
      if (hit && ERROR_BY_SELECTOR[hit[0].toLowerCase()]) selector = hit[0].toLowerCase() as Hex;
    }
    cur = cur.cause;
  }
  if (!selector && name && SELECTOR_BY_ERROR[name]) selector = SELECTOR_BY_ERROR[name];
  if (!name && selector) name = ERROR_BY_SELECTOR[selector] ?? null;
  return {selector, name};
}

/// The whole thing: any thrown value → one sentence. Never a bare "reverted".
export function explainRevert(e: unknown, ctx: RevertContext = {}): string {
  const {selector, name} = revertSelector(e);
  if (name && name in SELECTOR_BY_ERROR) return explainError(name, ctx);
  if (name && name.includes("EACUnauthorizedAccountRoles")) return "Refused by ENS: this wallet holds no role for that key.";
  const s = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied transaction|User denied/i.test(s)) return "You declined the transaction in your wallet.";
  if (/insufficient funds/i.test(s)) return "This wallet has no Sepolia ETH for gas.";
  if (selector) return `Reverted with an error Envoyage does not declare: selector ${selector}.`;
  const named = s.match(/reverted with the following reason:\s*([^\n]+)/);
  if (named) return named[1];
  const first = s.split("\n")[0];
  return first.length > 160 ? first.slice(0, 160) + "…" : first;
}

export const sameAddress = (a?: Address | string | null, b?: Address | string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
