import {describe, expect, it} from "vitest";
import {explainWalletError} from "../walletError";

/// The exact strings providers produce. These are not invented for the test —
/// "User rejected the request." is what the injected provider returned when a
/// wallet declined the chain switch during the live e2e run, and it is what was
/// reaching the screen verbatim before this decoder existed.
const REAL = {
  rejected: "User rejected the request.",
  rejectedMetaMask: "MetaMask Tx Signature: User denied transaction signature.",
  pending: "Request of type 'wallet_requestPermissions' already pending for origin http://localhost:4190.",
  unrecognised: "Unrecognized chain ID \"0xaa36a7\". Try adding the chain using wallet_addEthereumChain first.",
  noWallet: "No wallet found. Install MetaMask or Rabby.",
  noAccount: "Wallet returned no account."
};

describe("explainWalletError", () => {
  it("turns a declined chain switch into an instruction naming the network and the next press", () => {
    const s = explainWalletError(REAL.rejected);
    // The failure mode this guards: the raw provider string reaching the screen.
    expect(s).not.toBe(REAL.rejected);
    expect(s).toMatch(/Sepolia/);
    expect(s).toMatch(/connect again/);
  });

  it("covers MetaMask's own wording for the same refusal", () => {
    expect(explainWalletError(REAL.rejectedMetaMask)).toMatch(/declined/i);
  });

  it("tells the user to answer the prompt they already have open", () => {
    expect(explainWalletError(REAL.pending)).toMatch(/already has a prompt/i);
  });

  it("distinguishes a chain the wallet has never been given from one it refused", () => {
    const added = explainWalletError(REAL.unrecognised);
    expect(added).toMatch(/does not have Sepolia configured/i);
    expect(added).not.toMatch(/declined/i);
  });

  it("handles the no-wallet and no-account cases", () => {
    expect(explainWalletError(REAL.noWallet)).toMatch(/Install MetaMask/i);
    expect(explainWalletError(REAL.noAccount)).toMatch(/Unlock it/i);
  });

  it("never swallows an unrecognised error, and never returns empty", () => {
    const odd = "Some provider fault nobody has seen before";
    expect(explainWalletError(odd)).toBe(odd);
    expect(explainWalletError("x").length).toBeGreaterThan(0);
  });

  it("trims a wall of text to one line rather than flooding the chip", () => {
    const long = `${"y".repeat(400)}\nsecond line`;
    const s = explainWalletError(long);
    expect(s.length).toBeLessThanOrEqual(161);
    expect(s).not.toMatch(/second line/);
  });
});
