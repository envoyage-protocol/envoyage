import {useSession} from "../lib/session";
import {CHAIN} from "../lib/config";

/// Persistent while the wallet is on another chain. Every write button is
/// disabled through `onSepolia` in the session; this is the banner that says why.
export function NetworkBanner() {
  const {account, chainId, onSepolia, switchToSepolia} = useSession();
  if (!account || onSepolia) return null;
  return (
    <div className="net-banner" role="alert">
      <span>
        Your wallet is on chain {chainId ?? "?"}. Envoyage runs on {CHAIN.name} (chain {CHAIN.id}); every button
        is disabled until you switch.
      </span>
      <button className="act sm" onClick={switchToSepolia}>
        Switch to {CHAIN.name}
      </button>
    </div>
  );
}
