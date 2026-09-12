import {CHAIN} from "../lib/config";

/// Connect-time wallet errors, as a sentence that names the way out.
///
/// These are NOT contract reverts, so `explainRevert` does not cover them, and
/// they were reaching the screen as the provider's own string. The one that
/// matters: Envoyage is Sepolia-only, so `connect()` asks the wallet to switch
/// chains and rethrows if the user declines. Declining therefore leaves you with
/// no account at all — and the only thing on screen was "User rejected the
/// request.", which says what happened and nothing about what to do, on a page
/// whose whole claim is that every failure is a sentence you can act on.
///
/// It also means NetworkBanner's "Switch to Sepolia" button cannot help here: the
/// banner needs an account, and on the wrong chain there never is one. This copy
/// is the only recovery instruction the user gets.
export function explainWalletError(raw: string): string {
  const s = raw.toLowerCase();

  // 4001 / "user rejected" covers both the account prompt and the chain switch.
  // They are told apart by what the app had to ask for, not by the code.
  if (/user rejected|user denied|denied the request|rejected the request/.test(s)) {
    return `You declined the request in your wallet. Envoyage only runs on ${CHAIN.name}, so connecting asks to switch networks — approve it and press connect again.`;
  }
  if (/already pending|request of type|already processing/.test(s)) {
    return "Your wallet already has a prompt waiting. Open it, answer that one, then press connect again.";
  }
  if (/unrecognized chain|chain.*not.*added|4902/.test(s)) {
    return `Your wallet does not have ${CHAIN.name} configured. Add it in the wallet, then press connect again.`;
  }
  if (/no wallet found/.test(s)) {
    return "No wallet found in this browser. Install MetaMask or Rabby, then reload.";
  }
  if (/returned no account|no account/.test(s)) {
    return "Your wallet connected but exposed no account. Unlock it and press connect again.";
  }
  // Anything unrecognised is shown, trimmed — never swallowed, never a blank.
  const first = raw.split("\n")[0].trim();
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}
