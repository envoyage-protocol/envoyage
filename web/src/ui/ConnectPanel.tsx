import {useSession} from "../lib/session";
import {explainWalletError} from "./walletError";

/// The only thing a gated screen renders without an account: a headline, one
/// Connect button, and one line for the no-injected-wallet case.
export function ConnectPanel({headline, why}: {headline: string; why: string}) {
  const {connect, connecting, available, error} = useSession();
  return (
    <section className="sheet connect-panel" aria-labelledby="connect-h">
      <h2 id="connect-h" className="instrument-title">
        {headline}
      </h2>
      <p className="instrument-sub">{why}</p>
      <div style={{marginTop: 24}}>
        {available ? (
          <button className="act act-primary" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        ) : (
          <p className="pending">
            No wallet found in this browser. Install{" "}
            <a href="https://metamask.io" target="_blank" rel="noreferrer">
              MetaMask
            </a>{" "}
            or Rabby, then reload.
          </p>
        )}
        {error && (
          <p className="gate gate-refused" role="alert">
            {explainWalletError(error)}
          </p>
        )}
      </div>
    </section>
  );
}
