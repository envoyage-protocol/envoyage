import {afterEach, describe, expect, it, vi} from "vitest";
import {cleanup, render, screen, fireEvent} from "@testing-library/react";
import {ConfirmSheet} from "../ConfirmSheet";
import {planHireSteps, stepSatisfied, ZERO, type HireFacts, type HireStepId} from "../hireSteps";

afterEach(cleanup);

const ENVOYAGE = "0x8466e82E02edF3F00c0387D5C3E66d407dc7259C" as const;
const OWNER = "0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA" as const;

/// The labels Hire builds, keyed by step id. Kept here so the test asserts the
/// DERIVATION (which steps are pending) rather than a list of strings invented
/// for the test — a fixture I made up could not catch the bug this guards.
const LABELS: Record<HireStepId, string> = {
  retire: "Retire the old name",
  approve: "Approve the position to Envoyage — the contract, never the bot",
  grant: "Grant the mandate with these terms",
  publish: "Publish the scope as ENS text records"
};

function pendingLabels(f: HireFacts): string[] {
  return planHireSteps(f)
    .filter((id) => !stepSatisfied(id, f, ENVOYAGE, OWNER))
    .map((id) => LABELS[id]);
}

describe("ConfirmSheet", () => {
  const fresh: HireFacts = {approvedTo: ZERO, activeMandate: 0n, nameOwner: ZERO, previous: null};

  it("renders nothing while closed, so no sheet can be shown without being opened", () => {
    const {container} = render(<ConfirmSheet open={false} title="t" body="b" cta="go" onConfirm={() => {}} onCancel={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("enumerates approve and grant as TWO separate transactions, never collapsed into one", () => {
    const steps = pendingLabels(fresh);
    render(<ConfirmSheet open title="Confirm" body="sentence" steps={steps} cta="Sign in wallet" onConfirm={() => {}} onCancel={() => {}} />);

    // Three, in order, each its own list item — because the wallet will prompt
    // three times regardless and a hidden second prompt reads as a fault.
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain(LABELS.approve);
    expect(items[1].textContent).toContain(LABELS.grant);
    expect(items[2].textContent).toContain(LABELS.publish);
    expect(screen.getByText(/3 transactions/)).toBeTruthy();
  });

  it("omits a step that is already satisfied on chain, rather than promising a transaction that will not happen", () => {
    const approved: HireFacts = {...fresh, approvedTo: ENVOYAGE};
    // Guard the premise: this fixture must actually make approve satisfied, or
    // the assertion below passes for the wrong reason.
    expect(stepSatisfied("approve", approved, ENVOYAGE, OWNER)).toBe(true);

    render(<ConfirmSheet open title="Confirm" body="s" steps={pendingLabels(approved)} cta="Sign" onConfirm={() => {}} onCancel={() => {}} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.queryByText(LABELS.approve)).toBeNull();
    expect(screen.getByText(/2 transactions/)).toBeTruthy();
  });

  it("includes the retire step when a revoked mandate's name is still registered", () => {
    const carrying: HireFacts = {...fresh, nameOwner: OWNER, previous: {id: 7n, status: "REVOKED"}};
    expect(planHireSteps(carrying)[0]).toBe("retire");
    render(<ConfirmSheet open title="Confirm" body="s" steps={pendingLabels(carrying)} cta="Sign" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(/4 transactions/)).toBeTruthy();
  });

  it("confirms and cancels through the buttons, and cancels on Escape", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmSheet open title="Confirm" body="s" steps={["one"]} cta="Sign in wallet" onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByText("Sign in wallet"));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, {key: "Escape"});
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("is a modal dialog labelled by its title", () => {
    render(<ConfirmSheet open title="Confirm what you are granting" body="s" cta="Sign" onConfirm={() => {}} onCancel={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Confirm what you are granting");
  });
});
