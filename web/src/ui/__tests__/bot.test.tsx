import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {cleanup, render, screen, waitFor} from "@testing-library/react";

afterEach(cleanup);

const KEEPER = "0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B";
const OTHER = "0x000000000000000000000000000000000000dEaD";
const session = {account: KEEPER as string | null, client: {} as object | null, onSepolia: true};
vi.mock("../../lib/session", () => ({useSession: () => session}));

const fetchMandatesByKeeper = vi.fn();
vi.mock("../../lib/graph", () => ({fetchMandatesByKeeper: (...a: unknown[]) => fetchMandatesByKeeper(...a)}));

const readMandate = vi.fn();
vi.mock("../../lib/envoyage", async (orig) => ({...((await orig()) as object), readMandate: (...a: unknown[]) => readMandate(...a)}));

const preflight = vi.fn();
const compound = vi.fn();
vi.mock("../../lib/actions", () => ({
  preflight: (...a: unknown[]) => preflight(...a),
  compound: (...a: unknown[]) => compound(...a),
  positionLiquidity: vi.fn(async () => 5n * 10n ** 18n)
}));

import {Bot} from "../Bot";

const now = Math.floor(Date.now() / 1000);
const row = {
  id: "1", mandateId: "1", status: "ACTIVE", grantor: "0x311159a207d9c9c9ae83c4f83ed18de346bfa4ba", maxFeeBps: 200, feeRecipient: KEEPER,
  compoundAllowed: true, minInterval: "60", expiry: String(now + 86400), executionCount: 3, totalFee0ToKeeper: "0", totalLiquidityAdded: "0",
  lastExecutedAt: null, grantedAt: "1", grantedAtBlock: "1", grantedTx: "0x", revokedAt: null, revokedTx: null,
  keeper: {id: KEEPER.toLowerCase()}, position: {id: "38896", hasActiveMandate: true}
};
const mandate = {keeper: KEEPER, grantor: row.grantor, tokenId: 38896n, maxFeeBps: 200, feeRecipient: KEEPER, expiry: BigInt(now + 86400), minInterval: 60n, lastCall: BigInt(now - 10), compoundAllowed: true};
const MAY = {gate: "0x00000000", verdict: "may act", sentence: "Fees are waiting; the bot may compound now.", error: null};
const COOL = {gate: "0x00000000", verdict: "refused", sentence: "Cooldown active: the mandate allows one call every 60s, and 50s remain.", error: "CooldownActive"};

beforeEach(() => {
  session.account = KEEPER;
  fetchMandatesByKeeper.mockReset().mockResolvedValue({mandates: [row], indexedBlock: 1});
  readMandate.mockReset().mockResolvedValue(mandate);
  preflight.mockReset().mockResolvedValue(MAY);
  compound.mockReset();
});

describe("Bot", () => {
  it("keeper account with one mandate → one row, pre-flight sentence, enabled Compound", async () => {
    render(<Bot />);
    await screen.findByText("Mandate No. 1");
    await screen.findByText(/Fees are waiting/);
    await waitFor(() => expect((screen.getByText("Compound") as HTMLButtonElement).disabled).toBe(false));
  });

  it("a wallet no mandate names sees the explanatory panel and no buttons", async () => {
    session.account = OTHER;
    fetchMandatesByKeeper.mockResolvedValue({mandates: [], indexedBlock: 1});
    render(<Bot />);
    await screen.findByText(/No mandate names this wallet as keeper/);
    expect(screen.queryByText("Compound")).toBeNull();
  });

  it("a CooldownActive revert shows the seconds remaining and re-enables the button", async () => {
    compound.mockRejectedValue(Object.assign(new Error('The contract function "compound" reverted.'), {data: {errorName: "CooldownActive"}}));
    render(<Bot />);
    const btn = (await screen.findByText("Compound")) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    btn.click();
    await screen.findByText(/Cooldown active/);
    expect(screen.getByText(/50s remain/)).toBeTruthy();
    await waitFor(() => expect((screen.getByText("Compound") as HTMLButtonElement).disabled).toBe(false));
  });

  it("after a successful compound the pre-flight refreshes to the cooldown sentence", async () => {
    compound.mockResolvedValue("0xabc");
    preflight.mockResolvedValueOnce(MAY).mockResolvedValueOnce(COOL);
    render(<Bot />);
    const btn = (await screen.findByText("Compound")) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    btn.click();
    await screen.findByText(/Compounded\./);
    await screen.findByText(/50s remain/);
    expect(preflight).toHaveBeenCalledTimes(2);
  });
});
