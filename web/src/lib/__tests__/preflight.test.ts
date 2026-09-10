import {beforeEach, describe, expect, it, vi} from "vitest";

const simulate = vi.fn();
const canCompound = vi.fn();
vi.mock("../envoyage", async (orig) => {
  const real = (await orig()) as object;
  return {
    ...real,
    publicClient: {simulateContract: (...a: unknown[]) => simulate(...a)},
    readCanCompound: (...a: unknown[]) => canCompound(...a)
  };
});

import {preflight} from "../actions";
import {REFUSAL_REASONS} from "../envoyage";
import {explainRevert, revertSelector} from "../../ui/revert";
import {toFunctionSelector} from "viem";

const KEEPER = "0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B" as const;
const nameOf = (e: unknown) => revertSelector(e).name;
const abiError = (name: string) => Object.assign(new Error(`The contract function "compound" reverted.`), {data: {errorName: name}});

beforeEach(() => {
  simulate.mockReset();
  canCompound.mockReset();
});

describe("preflight", () => {
  it("says may act when the gate is open and the simulation succeeds", async () => {
    canCompound.mockResolvedValue("0x00000000");
    simulate.mockResolvedValue({request: {}});
    const r = await preflight(1n, KEEPER, null, explainRevert, nameOf);
    expect(r.verdict).toBe("may act");
  });

  it("turns an open gate with ZeroLiquidityDelta into no fees yet — the case canCompound alone gets wrong", async () => {
    canCompound.mockResolvedValue("0x00000000");
    simulate.mockRejectedValue(abiError("ZeroLiquidityDelta"));
    const r = await preflight(1n, KEEPER, null, explainRevert, nameOf);
    expect(r.verdict).toBe("no fees yet");
    expect(r.sentence).toMatch(/No fees have accrued/);
    expect(r.error).toBe("ZeroLiquidityDelta");
  });

  it("reports remaining cooldown seconds from lastCall + minInterval", async () => {
    const sel = toFunctionSelector("CooldownActive()");
    expect(REFUSAL_REASONS[sel]).toBeDefined();
    canCompound.mockResolvedValue("0x00000000");
    simulate.mockRejectedValue(abiError("CooldownActive"));
    const now = Math.floor(Date.now() / 1000);
    const mandate = {lastCall: BigInt(now - 100), minInterval: 300n} as never;
    const r = await preflight(1n, KEEPER, mandate, (e, ctx) => explainRevert(e, {...ctx, now}), nameOf);
    expect(r.verdict).toBe("refused");
    expect(r.sentence).toMatch(/200s remain/);
  });

  it("uses the gate's own reason when canCompound is closed", async () => {
    canCompound.mockResolvedValue(toFunctionSelector("MandateExpired()"));
    const r = await preflight(1n, KEEPER, null, explainRevert, nameOf);
    expect(r.verdict).toBe("refused");
    expect(r.sentence).toMatch(/expired/);
    expect(simulate).not.toHaveBeenCalled();
  });

  it("throws when the chain cannot be read; never returns may act", async () => {
    canCompound.mockRejectedValue(new Error("HTTP 429"));
    simulate.mockRejectedValue(new Error("HTTP 429"));
    await expect(preflight(1n, KEEPER, null, explainRevert, nameOf)).rejects.toThrow(/429/);
  });
});
