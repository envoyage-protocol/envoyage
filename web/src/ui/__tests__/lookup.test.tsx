import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";

afterEach(cleanup);

const readEnsScope = vi.fn();
const readMandate = vi.fn();
vi.mock("../../lib/envoyage", async (orig) => ({
  ...((await orig()) as object),
  readEnsScope: (...a: unknown[]) => readEnsScope(...a),
  readMandate: (...a: unknown[]) => readMandate(...a)
}));
const fetchMandate = vi.fn();
const fetchMandatesByPosition = vi.fn();
vi.mock("../../lib/graph", () => ({
  fetchMandate: (...a: unknown[]) => fetchMandate(...a),
  fetchMandatesByPosition: (...a: unknown[]) => fetchMandatesByPosition(...a)
}));

import {Lookup} from "../Lookup";

const KEEPER = "0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B";
const OWNER = "0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA";
const records = {"envoyage:keeper": KEEPER.toLowerCase(), "envoyage:maxFeeBps": "200", "envoyage:minInterval": "60", "envoyage:actions": "compound", "envoyage:lastRun": "11655313"};
const empty = Object.fromEntries(Object.keys(records).map((k) => [k, ""]));
const now = Math.floor(Date.now() / 1000);
const mandate = (over = {}) => ({
  id: "1", mandateId: "1", status: "ACTIVE", grantor: OWNER.toLowerCase(), maxFeeBps: 200, feeRecipient: KEEPER, compoundAllowed: true, minInterval: "60",
  expiry: String(now + 86400), executionCount: 3, totalFee0ToKeeper: "0", totalLiquidityAdded: "0", lastExecutedAt: null, grantedAt: "1", grantedAtBlock: "1",
  grantedTx: "0x", revokedAt: null, revokedTx: null, keeper: {id: KEEPER.toLowerCase()}, position: {id: "38896", hasActiveMandate: true}, ...over
});
const chain = {keeper: KEEPER, grantor: OWNER, tokenId: 38896n, maxFeeBps: 200, feeRecipient: KEEPER, expiry: BigInt(now + 86400), minInterval: 60n, lastCall: 0n, compoundAllowed: true};

function lookup(q: string) {
  render(<Lookup />);
  fireEvent.change(screen.getByLabelText(/Mandate number or ENS name/), {target: {value: q}});
  fireEvent.click(screen.getByText("Look up"));
}

beforeEach(() => {
  readEnsScope.mockReset().mockResolvedValue({node: "0x01", records});
  readMandate.mockReset().mockResolvedValue(chain);
  fetchMandate.mockReset().mockResolvedValue({mandate: mandate(), executions: [{id: "e", block: "11655313", timestamp: "1", tx: "0x786531", fee0ToKeeper: "0", fee1ToKeeper: "0", liquidityAdded: "5"}], indexedBlock: 200});
  fetchMandatesByPosition.mockReset().mockResolvedValue({mandates: [mandate()], indexedBlock: 200});
});

describe("Lookup", () => {
  it("1 → both cards for mandate #1", async () => {
    lookup("1");
    await screen.findByText("No. 1");
    await screen.findByText("envoyage:keeper");
    expect(readEnsScope).toHaveBeenCalledWith(38896n);
    expect(screen.getAllByText("11655313", {exact: false}).length).toBeGreaterThanOrEqual(2); // lastRun record and the execution block
  });

  it("38896.envoyage.eth → resolver card, subgraph card by position", async () => {
    lookup("38896.envoyage.eth");
    await screen.findByText("envoyage:keeper");
    await screen.findByText("No. 1");
    expect(fetchMandatesByPosition).toHaveBeenCalledWith(38896n);
  });

  it("name resolves but nothing is indexed → distinct state", async () => {
    fetchMandatesByPosition.mockResolvedValue({mandates: [], indexedBlock: 200});
    lookup("39999.envoyage.eth");
    await screen.findByText(/has not indexed a mandate for it yet/);
  });

  it("number of a revoked mandate → REVOKED status and the historical banner on the resolver card", async () => {
    readMandate.mockResolvedValue({...chain, keeper: "0x0000000000000000000000000000000000000000"});
    fetchMandate.mockResolvedValue({mandate: mandate({status: "REVOKED", revokedAt: String(now)}), executions: [], indexedBlock: 200});
    lookup("1");
    await screen.findByText(/this record is historical/);
    expect(screen.getByText("revoked", {selector: ".status"})).toBeTruthy();
  });

  it("unknown name → name not found, no zeroes", async () => {
    readEnsScope.mockResolvedValue({node: "0x0", records: empty});
    fetchMandatesByPosition.mockResolvedValue({mandates: [], indexedBlock: 200});
    lookup("12345.envoyage.eth");
    await screen.findByText(/Name not found/);
    expect(screen.queryByText("0.00%")).toBeNull();
  });

  it("subgraph down → resolver card renders; subgraph card shows error with Retry", async () => {
    fetchMandatesByPosition.mockRejectedValue(new Error("502 Bad Gateway"));
    lookup("38896.envoyage.eth");
    await screen.findByText("envoyage:keeper");
    await screen.findByText(/Subgraph query failed/);
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("alice.envoyage.eth → rejected with a sentence", () => {
    lookup("alice.envoyage.eth");
    expect(screen.getByText(/not a mandate name/)).toBeTruthy();
  });
});
