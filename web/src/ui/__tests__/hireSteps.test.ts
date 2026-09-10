import {describe, expect, it} from "vitest";
import {planHireSteps, stepSatisfied, validateTerms, ZERO, type HireFacts} from "../hireSteps";

const ENVOYAGE = "0x8466e82E02edF3F00c0387D5C3E66d407dc7259C" as const;
const OWNER = "0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA" as const;

const fresh: HireFacts = {approvedTo: ZERO, activeMandate: 0n, nameOwner: ZERO, previous: null};

describe("planHireSteps", () => {
  it("fresh position, no name → approve, grant, publish", () => {
    expect(planHireSteps(fresh)).toEqual(["approve", "grant", "publish"]);
    expect(stepSatisfied("approve", fresh, ENVOYAGE, OWNER)).toBe(false);
  });

  it("already approved to Envoyage → approve is satisfied, grant and publish are not", () => {
    const f = {...fresh, approvedTo: ENVOYAGE};
    expect(planHireSteps(f)).toEqual(["approve", "grant", "publish"]);
    expect(stepSatisfied("approve", f, ENVOYAGE, OWNER)).toBe(true);
    expect(stepSatisfied("grant", f, ENVOYAGE, OWNER)).toBe(false);
    expect(stepSatisfied("publish", f, ENVOYAGE, OWNER)).toBe(false);
  });

  it("previous mandate revoked and name still registered → retire first", () => {
    const f: HireFacts = {...fresh, nameOwner: OWNER, previous: {id: 7n, status: "REVOKED"}};
    expect(planHireSteps(f)).toEqual(["retire", "approve", "grant", "publish"]);
    expect(stepSatisfied("retire", f, ENVOYAGE, OWNER)).toBe(false);
    expect(stepSatisfied("retire", {...f, nameOwner: ZERO}, ENVOYAGE, OWNER)).toBe(true);
  });

  it("granted but not yet published → grant satisfied, publish not", () => {
    const f: HireFacts = {approvedTo: ENVOYAGE, activeMandate: 9n, nameOwner: ZERO, previous: {id: 9n, status: "ACTIVE"}};
    expect(planHireSteps(f)).toEqual(["approve", "grant", "publish"]);
    expect(stepSatisfied("grant", f, ENVOYAGE, OWNER)).toBe(true);
    expect(stepSatisfied("publish", f, ENVOYAGE, OWNER)).toBe(false);
  });

  it("does not insert retire for a live previous mandate (the row is unselectable anyway)", () => {
    const f: HireFacts = {approvedTo: ENVOYAGE, activeMandate: 9n, nameOwner: OWNER, previous: {id: 9n, status: "ACTIVE"}};
    expect(planHireSteps(f)).toEqual(["approve", "grant", "publish"]);
    expect(stepSatisfied("publish", f, ENVOYAGE, OWNER)).toBe(true);
  });
});

describe("validateTerms", () => {
  it("rejects a 12% fee cap with a message naming the 10% limit", () => {
    const r = validateTerms({feeCapPercent: 12, cooldownMinutes: 5, expiryDays: 30});
    expect(r.ok).toBe(false);
    expect((r as {reason: string}).reason).toMatch(/10%/);
  });
  it("accepts a zero cooldown", () => {
    const r = validateTerms({feeCapPercent: 2, cooldownMinutes: 0, expiryDays: 30}, 1_000_000);
    expect(r).toEqual({ok: true, maxFeeBps: 200, minInterval: 0n, expiry: BigInt(1_000_000 + 30 * 86400)});
  });
  it("rejects a non-positive expiry", () => {
    expect(validateTerms({feeCapPercent: 2, cooldownMinutes: 5, expiryDays: 0}).ok).toBe(false);
  });
});
