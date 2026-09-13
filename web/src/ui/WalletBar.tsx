import {useEffect, useRef, useState} from "react";
import {useSession} from "../lib/session";
import {short} from "./kit";
import {explainWalletError} from "./walletError";

/// The connected account, in the same chip shape as the network status beside it.
/// It carries an ink edge where the network chip carries a rule, because this is
/// the only interactive control in that corner and the difference should be the
/// one thing you can see.
///
/// Switching wallets lives INSIDE the chip, not beside it. A second control in
/// the masthead cost the row its proportions — the brand mark was pushed out of
/// its column — for an action taken once, if ever. With a single wallet installed
/// the chip is not even interactive, which is the state almost every visitor is
/// in, and the row is exactly what it was before any of this.
export function WalletBar() {
  const {account, connecting, error, available, connect, providers, provider, chooseProvider} = useSession();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const many = providers.length > 1;

  // A menu that cannot be dismissed is a trap on a page where the next thing to
  // press is usually behind it.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = providers.find((p) => p.rdns === provider);
  const label = account ? short(account) : connecting ? "connecting…" : many && !provider ? "choose a wallet" : "connect wallet";

  async function press() {
    if (many) {
      setOpen((v) => !v);
      return;
    }
    if (!account) await connect();
  }

  return (
    <div className="wallet" ref={box}>
      {!available ? (
        <a className="chip" href="https://metamask.io" target="_blank" rel="noreferrer">
          get a wallet
        </a>
      ) : account && !many ? (
        // Nothing to switch to: a label, not a control.
        <span className="chip" title={account}>
          <i className="dot dot-amber" aria-hidden="true" />
          <span className="chip-key">wallet</span>
          {label}
        </span>
      ) : (
        <button
          className="chip"
          onClick={press}
          disabled={connecting}
          aria-haspopup={many ? "listbox" : undefined}
          aria-expanded={many ? open : undefined}
          title={account ? `${account}${current ? ` · ${current.name}` : ""} — click to switch wallet` : undefined}
        >
          {account && <i className="dot dot-amber" aria-hidden="true" />}
          {account && <span className="chip-key">wallet</span>}
          {label}
        </button>
      )}

      {open && many && (
        <ul className="wallet-pick" role="listbox" aria-label="Installed wallets">
          {providers.map((p) => (
            <li key={p.rdns}>
              <button
                role="option"
                aria-selected={p.rdns === provider}
                onClick={async () => {
                  setOpen(false);
                  if (p.rdns === provider && account) return;
                  chooseProvider(p.rdns);
                  await connect();
                }}
              >
                {p.icon ? <img src={p.icon} alt="" width={16} height={16} /> : null}
                <span>{p.name}</span>
                {p.rdns === provider && account ? <i className="pick-on" aria-hidden="true" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <span className="wallet-err" role="alert">
          {explainWalletError(error)}
        </span>
      )}
    </div>
  );
}
