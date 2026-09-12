import {useSession} from "../lib/session";
import {short} from "./kit";
import {explainWalletError} from "./walletError";

/// The connected account, in the same chip shape as the network status beside it.
/// It carries an ink edge where the network chip carries a rule, because this is
/// the only interactive control in that corner and the difference should be the
/// one thing you can see.
export function WalletBar() {
  const {account, connecting, error, available, connect} = useSession();
  return (
    <div className="wallet">
      {account ? (
        <span className="chip" title={account}>
          <i className="dot dot-amber" aria-hidden="true" />
          {short(account)}
        </span>
      ) : available ? (
        <button className="chip" onClick={connect} disabled={connecting}>
          {connecting ? "connecting…" : "connect wallet"}
        </button>
      ) : (
        <a className="chip" href="https://metamask.io" target="_blank" rel="noreferrer">
          get a wallet
        </a>
      )}
      {error && (
        <span className="wallet-err" role="alert">
          {explainWalletError(error)}
        </span>
      )}
    </div>
  );
}
