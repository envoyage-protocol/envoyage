import {describe, it, expect, vi} from "vitest";
import {tick, type SwapSender} from "../swap-loop";

const ok: SwapSender = vi.fn(async (z) => (z ? "0xaa" : "0xbb") as `0x${string}`);

describe("swap loop tick", () => {
  it("sends a round trip — zeroForOne then back — when funded", async () => {
    const send = vi.fn(ok);
    const r = await tick(send, 10n ** 18n);
    expect(r).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBe(true);
    expect(send.mock.calls[1][0]).toBe(false);
  });

  it("skips without sending when the balance is below the floor", async () => {
    const send = vi.fn(ok);
    const r = await tick(send, 1n); // 1 wei
    expect(r).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("reports failed, not thrown, when a send errors — the loop must survive", async () => {
    const send = vi.fn(async () => {
      throw new Error("RPC 429");
    }) as unknown as SwapSender;
    await expect(tick(send, 10n ** 18n)).resolves.toBe("failed");
  });
});
