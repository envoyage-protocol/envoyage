import {useSession} from "../lib/session";
import {short} from "./kit";

export function WalletBar() {
  const {account, connecting, error, available, connect} = useSession();
  return (
    <div className="wallet">
      {account ? (
        <span className="wallet-on">
          <span className="dot" aria-hidden="true" /> {short(account)}
        </span>
      ) : available ? (
        <button className="act act-ghost sm" onClick={connect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      ) : (
        <a className="act act-ghost sm" href="https://metamask.io" target="_blank" rel="noreferrer">
          Get a wallet
        </a>
      )}
      {error && <span className="wallet-err">{error}</span>}
    </div>
  );
}
