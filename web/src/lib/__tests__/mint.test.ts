import {describe, expect, it} from "vitest";
import {decodeAbiParameters} from "viem";
import {buildMintActions, rangeAroundTick, demoPoolId} from "../actions";
import {DEMO_POOL} from "../config";

describe("demo mint encoding", () => {
  it("centres the range on the current tick, snapped to the spacing", () => {
    expect(rangeAroundTick(34, 200)).toEqual({tickLower: -2000, tickUpper: 2000});
    expect(rangeAroundTick(1234, 200)).toEqual({tickLower: -800, tickUpper: 3200});
    expect(rangeAroundTick(-1, 200)).toEqual({tickLower: -2200, tickUpper: 1800});
    const r = rangeAroundTick(5555, 200);
    expect(r.tickLower % 200).toBe(0);
    expect(r.tickLower < 5555 && 5555 < r.tickUpper).toBe(true);
  });

  it("encodes MINT_POSITION + SETTLE_PAIR as the seed script does", () => {
    const owner = "0x000000000000000000000000000000000000dEaD";
    const data = buildMintActions(owner, -2000, 2000, 100n);
    const [actions, params] = decodeAbiParameters([{type: "bytes"}, {type: "bytes[]"}], data);
    expect(actions).toBe("0x020d");
    expect(params).toHaveLength(2);
    const [key, lo, hi, liq, a0, a1, to] = decodeAbiParameters(
      [
        {type: "tuple", components: [{type: "address"}, {type: "address"}, {type: "uint24"}, {type: "int24"}, {type: "address"}]},
        {type: "int24"}, {type: "int24"}, {type: "uint256"}, {type: "uint128"}, {type: "uint128"}, {type: "address"}, {type: "bytes"}
      ],
      params[0]
    ) as unknown as [readonly [string, string, number, number, string], number, number, bigint, bigint, bigint, string, string];
    expect(key[0]).toBe(DEMO_POOL.currency0);
    expect(key[3]).toBe(200);
    expect([lo, hi, liq]).toEqual([-2000, 2000, 100n]);
    expect(a0).toBe((1n << 128n) - 1n);
    expect(a1).toBe((1n << 128n) - 1n);
    expect(to.toLowerCase()).toBe(owner.toLowerCase());
  });

  it("derives the pool id v4 uses for the demo pool", () => {
    expect(demoPoolId()).toBe("0x9c4d5ec491eff6e6eb08c6a65aaf0184c4531060fff704efae169d4d2a8c9ab2");
  });
});
