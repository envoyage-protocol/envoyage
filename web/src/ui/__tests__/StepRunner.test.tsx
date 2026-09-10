import {describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useStepRunner, type Step} from "../StepRunner";

const A = "0x000000000000000000000000000000000000aaaa" as const;
const B = "0x000000000000000000000000000000000000bbbb" as const;

function mkStep(id: string, done: boolean, run = vi.fn(async () => "0xhash" as `0x${string}`)): Step {
  return {id, label: id, isDone: vi.fn(async () => done), run};
}

describe("useStepRunner", () => {
  it("runs three not-done steps in order, each running → done", async () => {
    const order: string[] = [];
    const steps = ["a", "b", "c"].map((id) => mkStep(id, false, vi.fn(async () => {
      order.push(id);
      return "0x1" as `0x${string}`;
    })));
    const {result} = renderHook(() => useStepRunner(steps, {account: A}));
    await act(() => result.current.start());
    expect(order).toEqual(["a", "b", "c"]);
    expect(result.current.statuses.map((s) => s.phase)).toEqual(["done", "done", "done"]);
    expect(result.current.complete).toBe(true);
  });

  it("starts at step 2 when step 1 is already satisfied, without running it", async () => {
    const steps = [mkStep("a", true), mkStep("b", false), mkStep("c", false)];
    const {result} = renderHook(() => useStepRunner(steps, {account: A}));
    await act(() => result.current.start());
    expect(steps[0].run).not.toHaveBeenCalled();
    expect(result.current.statuses.map((s) => s.phase)).toEqual(["skipped", "done", "done"]);
  });

  it("stops at a failing step with the decoded sentence; Retry re-runs only that step", async () => {
    const failing = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('The contract function "grant" reverted.'), {data: {errorName: "NotPositionOwner"}}))
      .mockResolvedValueOnce("0x2");
    const steps = [mkStep("a", false), mkStep("b", false, failing), mkStep("c", false)];
    const {result} = renderHook(() => useStepRunner(steps, {account: A}));
    await act(() => result.current.start());
    expect(result.current.statuses[1].phase).toBe("failed");
    expect((result.current.statuses[1] as {error: string}).error).toMatch(/does not own the position/);
    expect(steps[2].run).not.toHaveBeenCalled();

    await act(() => result.current.retry(1));
    await waitFor(() => expect(result.current.statuses.map((s) => s.phase)).toEqual(["done", "done", "done"]));
    expect(steps[0].run).toHaveBeenCalledTimes(1);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("halts when the account changes mid-sequence", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const steps = [
      mkStep("a", false, vi.fn(async () => {
        await gate;
        return "0x1" as `0x${string}`;
      })),
      mkStep("b", false)
    ];
    const {result, rerender} = renderHook(({account}) => useStepRunner(steps, {account}), {initialProps: {account: A as `0x${string}`}});
    let p!: Promise<void>;
    act(() => {
      p = result.current.start();
    });
    rerender({account: B});
    release();
    await act(() => p);
    expect(result.current.halted).toMatch(/account changed/);
    expect(steps[1].run).not.toHaveBeenCalled();
  });
});
