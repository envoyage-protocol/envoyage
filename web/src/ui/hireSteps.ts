import type {Address} from "viem";

export const ZERO = "0x0000000000000000000000000000000000000000" as const;

/// What the chain and the subgraph say about a position before hiring.
export type HireFacts = {
  /// getApproved(tokenId)
  approvedTo: Address;
  /// activeMandate[tokenId] on Envoyage; 0 when none
  activeMandate: bigint;
  /// registry owner of "<tokenId>" under envoyage.eth; zero when not registered
  nameOwner: Address;
  /// the newest mandate the subgraph knows on this position, if any
  previous: {id: bigint; status: "ACTIVE" | "REVOKED"} | null;
};

export type HireStepId = "retire" | "approve" | "grant" | "publish";

/// Which steps the hire sequence contains, in order. approve / grant / publish
/// are always present and are skipped at run time when already satisfied
/// (isDone); retire is inserted only when the label is still registered from an
/// earlier, now-revoked mandate — publish would otherwise fail because the name
/// cannot be re-registered while it exists.
export function planHireSteps(f: HireFacts): HireStepId[] {
  const steps: HireStepId[] = [];
  if (f.nameOwner !== ZERO && f.previous?.status === "REVOKED" && f.activeMandate === 0n) steps.push("retire");
  steps.push("approve", "grant", "publish");
  return steps;
}

/// Per-step "already satisfied" checks, from the same facts. Pure so it can be
/// tested; the screen re-reads the facts before each check.
export function stepSatisfied(id: HireStepId, f: HireFacts, envoyage: Address, grantor: Address): boolean {
  switch (id) {
    case "retire":
      return f.nameOwner === ZERO;
    case "approve":
      return f.approvedTo.toLowerCase() === envoyage.toLowerCase();
    case "grant":
      return f.activeMandate !== 0n;
    case "publish":
      // Registered to the grantor AND backing a live mandate: nothing to publish.
      return f.nameOwner.toLowerCase() === grantor.toLowerCase() && f.activeMandate !== 0n;
  }
}

/// The hire form's terms, validated. Fee cap in bps (hard max 1000 = 10%),
/// cooldown in seconds (0 allowed — the contract permits it), expiry as a unix
/// timestamp in the future.
export type TermsInput = {feeCapPercent: number; cooldownMinutes: number; expiryDays: number};

export function validateTerms(t: TermsInput, now = Math.floor(Date.now() / 1000)): {ok: true; maxFeeBps: number; minInterval: bigint; expiry: bigint} | {ok: false; reason: string} {
  if (!Number.isFinite(t.feeCapPercent) || t.feeCapPercent < 0) return {ok: false, reason: "Fee cap must be a percentage between 0 and 10."};
  if (t.feeCapPercent > 10) return {ok: false, reason: "Fee cap is limited to 10% of harvested fees by the contract."};
  if (!Number.isFinite(t.cooldownMinutes) || t.cooldownMinutes < 0) return {ok: false, reason: "Cooldown cannot be negative."};
  if (!Number.isFinite(t.expiryDays) || t.expiryDays <= 0) return {ok: false, reason: "Expiry must be in the future."};
  return {
    ok: true,
    maxFeeBps: Math.round(t.feeCapPercent * 100),
    minInterval: BigInt(Math.round(t.cooldownMinutes * 60)),
    expiry: BigInt(now + Math.round(t.expiryDays * 86400))
  };
}
