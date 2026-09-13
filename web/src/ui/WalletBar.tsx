import {useState} from "react";
import {useSession} from "../lib/session";
import {short} from "./kit";
import {explainWalletError} from "./walletError";

/// The connected account, in the same chip shape as the network status beside it.
/// It carries an ink edge where the network chip carries a rule, because this is
/// the only interactive control in that corner and the difference should be the
/// one thing you can see.
///
/// With more than one wallet installed the chip opens a picker first. That list
/// only exists because `window.ethereum` is a single slot every extension writes
/// to: without EIP-6963 the page cannot offer a choice, and a judge running two
/// wallets gets whichever one loaded last — with no way to say otherwise.
export function WalletBar() {
  const {account, connecting, error, available, connect, providers, provider, chooseProvider} = useSession();
  const [picking, setPicking] = useState(false);
  const many = providers.length > 1;

  async function press() {
    if (many && !provider) {
      setPicking((v) => !v);
      return;
    }
    await connect();
  }

  const current = providers.find((p) => p.rdns === provider);

  return (
    <div className="wallet">
      {account ? (
        <span className="chip" title={`${account}${current ? ` · ${current.name}` : ""}`}>
          <i className="dot dot-amber" aria-hidden="true" />
          <span className="chip-key">wallet</span>
          {short(account)}
        </span>
      ) : available ? (
        <button className="chip" onClick={press} disabled={connecting} aria-expanded={many ? picking : undefined}>
          {connecting ? "connecting…" : many && !provider ? "choose a wallet" : "connect wallet"}
        </button>
      ) : (
        <a className="chip" href="https://metamask.io" target="_blank" rel="noreferrer">
          get a wallet
        </a>
      )}

      {picking && !account && (
        <ul className="wallet-pick" role="listbox" aria-label="Installed wallets">
          {providers.map((p) => (
            <li key={p.rdns}>
              <button
                role="option"
                aria-selected={p.rdns === provider}
                onClick={async () => {
                  chooseProvider(p.rdns);
                  setPicking(false);
                  await connect();
                }}
              >
                {p.icon ? <img src={p.icon} alt="" width={16} height={16} /> : null}
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {account && many && (
        <button
          className="wallet-swap"
          onClick={() => {
            chooseProvider(null);
            setPicking(true);
          }}
        >
          change wallet
        </button>
      )}

      {error && (
        <span className="wallet-err" role="alert">
          {explainWalletError(error)}
        </span>
      )}
    </div>
  );
}
