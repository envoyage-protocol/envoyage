import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {cleanup, render, screen} from "@testing-library/react";

afterEach(cleanup);

const OWNER = "0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA";
const KEEPER = "0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B";
const OTHER = "0x000000000000000000000000000000000000dEaD";

const session = {account: OWNER as string | null, client: {} as object | null, onSepolia: true};
vi.mock("../../lib/session", () => ({useSession: () => session}));

const fetchMandate = vi.fn();
const fetchMandatesByGrantor = vi.fn();
vi.mock("../../lib/graph", () => ({
  fetchMandate: (...a: unknown[]) => fetchMandate(...a),
  fetchMandatesByGrantor: (...a: unknown[]) => fetchMandatesByGrantor(...a)
}));

const readMandate = vi.fn();
const readNameOwner = vi.fn();
vi.mock("../../lib/envoyage", async (orig) => ({
  ...((await orig()) as object),
  readMandate: (...a: unknown[]) => readMandate(...a),
  readNameOwner: (...a: unknown[]) => readNameOwner(...a)
}));

const preflight = vi.fn();
vi.mock("../../lib/actions", () => ({
  preflight: (...a: unknown[]) => preflight(...a),
  revoke: vi.fn(),
  publishName: vi.fn(),
  retireName: vi.fn()
}));

import {MandateRow} from "../MandateRow";
import {MyMandates} from "../MyMandates";

const now = Math.floor(Date.now() / 1000);
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "5",
  mandateId: "5",
  status: "ACTIVE",
  grantor: OWNER.toLowerCase(),
  maxFeeBps: 200,
  feeRecipient: KEEPER,
  compoundAllowed: true,
  minInterval: "300",
  expiry: String(now + 86400),
  executionCount: 0,
  totalFee0ToKeeper: "0",
  totalLiquidityAdded: "0",
  lastExecutedAt: null,
  grantedAt: String(now - 30),
  grantedAtBlock: "1",
  grantedTx: "0xaa",
  revokedAt: null,
  revokedTx: null,
  keeper: {id: KEEPER.toLowerCase()},
  position: {id: "39160", hasActiveMandate: true},
  ...over
});
const chainMandate = {keeper: KEEPER, grantor: OWNER, tokenId: 39160n, maxFeeBps: 200, feeRecipient: KEEPER, expiry: BigInt(now + 86400), minInterval: 300n, lastCall: 0n, compoundAllowed: true};

beforeEach(() => {
  session.account = OWNER;
  fetchMandate.mockReset();
  readMandate.mockReset().mockResolvedValue(chainMandate);
  readNameOwner.mockReset().mockResolvedValue(OWNER);
  preflight.mockReset().mockResolvedValue({gate: "0x00000000", verdict: "no fees yet", sentence: "No fees have accrued since the last compound — nothing to reinvest yet.", error: "ZeroLiquidityDelta"});
});

describe("MandateRow", () => {
  it("names the pre-flight reason in the waiting copy for a fresh mandate", async () => {
    fetchMandate.mockResolvedValue({mandate: row(), executions: [], indexedBlock: 100});
    render(<MandateRow row={row() as never} pollMs={10_000} go={() => {}} />);
    await screen.findByText(/Waiting for the bot/);
    await screen.findByText(/No fees have accrued/);
    expect(screen.getByText(/expected within ~/)).toBeTruthy();
    expect(screen.getByText("39160.envoyage.eth", {exact: false})).toBeTruthy();
  });

  it("updates to compounded — indexed at block N when the subgraph count rises, then stops polling", async () => {
    fetchMandate
      .mockResolvedValueOnce({mandate: row(), executions: [], indexedBlock: 100})
      .mockResolvedValueOnce({mandate: row({executionCount: 1}), executions: [{id: "e", block: "123", timestamp: String(now), tx: "0xbb", fee0ToKeeper: "0", fee1ToKeeper: "0", liquidityAdded: "5"}], indexedBlock: 124});
    render(<MandateRow row={row() as never} pollMs={20} go={() => {}} />);
    await screen.findByText(/indexed at block/);
    expect(screen.getByText("123", {exact: false})).toBeTruthy();
    await new Promise((r) => setTimeout(r, 80));
    expect(fetchMandate).toHaveBeenCalledTimes(2);
  });

  it("disables Revoke with a switch hint when the connected account is not the grantor", async () => {
    session.account = OTHER;
    fetchMandate.mockResolvedValue({mandate: row(), executions: [], indexedBlock: 100});
    render(<MandateRow row={row() as never} pollMs={10_000} go={() => {}} />);
    const btn = (await screen.findByText("Revoke")) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Switch to the owner wallet/)).toBeTruthy();
  });

  it("offers Publish name when the label is not registered", async () => {
    readNameOwner.mockResolvedValue("0x0000000000000000000000000000000000000000");
    fetchMandate.mockResolvedValue({mandate: row(), executions: [], indexedBlock: 100});
    render(<MandateRow row={row() as never} pollMs={10_000} go={() => {}} />);
    await screen.findByText("Publish name");
  });

  it("shows REVOKED with the name still resolving and Retire name", async () => {
    readMandate.mockResolvedValue({...chainMandate, keeper: "0x0000000000000000000000000000000000000000"});
    fetchMandate.mockResolvedValue({mandate: row({status: "REVOKED", revokedTx: "0xcc"}), executions: [], indexedBlock: 100});
    render(<MandateRow row={row({status: "REVOKED", revokedTx: "0xcc"}) as never} pollMs={10_000} go={() => {}} />);
    await screen.findByText("Retire name");
    expect(screen.getByText(/still resolves/)).toBeTruthy();
    expect(screen.queryByText("Revoke")).toBeNull();
  });
});

describe("MyMandates", () => {
  it("renders one row per mandate", async () => {
    fetchMandatesByGrantor.mockResolvedValue({mandates: [row(), row({id: "6", mandateId: "6", position: {id: "39161", hasActiveMandate: true}})], indexedBlock: 100});
    fetchMandate.mockResolvedValue({mandate: row(), executions: [], indexedBlock: 100});
    render(<MyMandates go={() => {}} />);
    await screen.findByText("Mandate No. 5");
    await screen.findByText("Mandate No. 6");
  });
  it("shows one line and a Hire link when there are none", async () => {
    fetchMandatesByGrantor.mockResolvedValue({mandates: [], indexedBlock: 100});
    render(<MyMandates go={() => {}} />);
    await screen.findByText(/granted no mandates yet/);
    expect(screen.getByText("Hire a keeper")).toBeTruthy();
  });
  it("shows an inline error with Retry when the subgraph fails, never an empty list", async () => {
    fetchMandatesByGrantor.mockRejectedValueOnce(new Error("502 Bad Gateway")).mockResolvedValueOnce({mandates: [], indexedBlock: 1});
    fetchMandate.mockResolvedValue({mandate: row(), executions: [], indexedBlock: 100});
    render(<MyMandates go={() => {}} />);
    await screen.findByText(/Subgraph query failed/);
    expect(screen.queryByText(/granted no mandates yet/)).toBeNull();
    (screen.getByText("Retry") as HTMLButtonElement).click();
    await screen.findByText(/granted no mandates yet/);
  });
});
