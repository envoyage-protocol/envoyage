/// A real wallet for Playwright, without a browser extension.
///
/// Playwright cannot drive MetaMask's UI — it is an extension popup outside the
/// page. The usual workarounds either mock the chain (which proves nothing about
/// the integration) or automate the extension (slow, brittle, version-bound).
/// This does neither: it injects an EIP-1193 provider that satisfies the app's
/// `window.ethereum` contract, and every call it cannot answer locally goes to
/// real Sepolia. Signatures are real, broadcasts are real, receipts are real.
///
/// The private key NEVER enters the browser context. `window.ethereum.request`
/// forwards to an exposed Node binding; the key lives only in this process. A
/// key in `addInitScript` would be readable by any script on the page and would
/// sit in Playwright's trace files.
import {createWalletClient, createPublicClient, http, publicActions} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {sepolia} from "viem/chains";

const CHAIN_ID_HEX = "0xaa36a7"; // 11155111

/// Methods the wallet answers itself. Everything else is proxied to the node.
/// eth_accounts and eth_requestAccounts are the gate the app's `hasWallet()` and
/// `connect()` go through.
export function makeWallet({privateKey, rpcUrl}) {
  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({account, chain: sepolia, transport}).extend(publicActions);
  const pub = createPublicClient({chain: sepolia, transport});

  const sent = [];

  async function request({method, params = []}) {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return CHAIN_ID_HEX;
      case "net_version":
        return String(sepolia.id);
      // Already on Sepolia, so the switch is a no-op success rather than an
      // error — returning 4902 here would send the app down the addChain path
      // for a chain it is already on.
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;

      // viem falls back to wallet_sendTransaction when eth_sendTransaction fails
      // on some providers, so both must be handled. Forwarding the fallback raw
      // to the node makes a real "insufficient funds" surface as the node's
      // "JSON is not a valid request object" — a harness bug that reads exactly
      // like an app bug.
      case "wallet_sendTransaction":
      case "eth_sendTransaction": {
        const [tx] = params;
        // viem's `custom()` transport hands the wallet a tx object with hex
        // fields; convert to what writeContract/sendTransaction expects.
        const hash = await wallet.sendTransaction({
          account,
          to: tx.to ?? undefined,
          data: tx.data ?? undefined,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined
        });
        sent.push({hash, to: tx.to, data: tx.data});
        return hash;
      }

      case "personal_sign": {
        const [message] = params;
        return wallet.signMessage({account, message: {raw: message}});
      }
      case "eth_signTypedData_v4": {
        const [, json] = params;
        return wallet.signTypedData({account, ...JSON.parse(json)});
      }

      default:
        // Reads: eth_call, eth_estimateGas, eth_getTransactionCount,
        // eth_blockNumber, eth_getTransactionReceipt, eth_getLogs, …
        return pub.request({method, params});
    }
  }

  return {address: account.address, request, sent};
}

/// Installs the provider on a Playwright page. Call BEFORE the first navigation:
/// the app reads `window.ethereum` during the first render.
export async function installWallet(page, {privateKey, rpcUrl, label = "wallet"}) {
  const w = makeWallet({privateKey, rpcUrl});

  // The only channel between page and key-holder. Params cross as JSON, so
  // BigInt never has to survive the boundary.
  await page.exposeFunction("__envoyageWalletRequest", async (raw) => {
    const {method, params} = JSON.parse(raw);
    try {
      const result = await w.request({method, params});
      return JSON.stringify({ok: true, result});
    } catch (e) {
      // Shaped like a REAL provider error, which means the message must be the
      // node's, not viem's summary of it. viem wraps the raw RPC error several
      // causes deep: the outer shortMessage reads "The total cost ... exceeds
      // the balance of the account" while the innermost is "insufficient funds
      // for gas * price + value: have X want Y". MetaMask hands the app the
      // latter. Returning the former made the app's correct
      // /insufficient funds/ branch miss and fall through to a generic — an
      // app bug that was entirely an artifact of this bridge.
      let deepest = e;
      while (deepest?.cause) deepest = deepest.cause;
      const raw = deepest?.message ?? e?.shortMessage ?? e?.message ?? String(e);
      return JSON.stringify({
        ok: false,
        error: {message: raw, code: e?.code ?? deepest?.code ?? -32000, data: e?.data ?? e?.cause?.data}
      });
    }
  });

  await page.addInitScript(() => {
    const listeners = {};
    window.ethereum = {
      isMetaMask: true,
      isEnvoyageTestWallet: true,
      async request(args) {
        const raw = await window.__envoyageWalletRequest(JSON.stringify({method: args.method, params: args.params ?? []}));
        const res = JSON.parse(raw);
        if (res.ok) return res.result;
        const err = new Error(res.error.message);
        err.code = res.error.code;
        err.data = res.error.data;
        throw err;
      },
      on(event, cb) {
        (listeners[event] ||= []).push(cb);
      },
      removeListener(event, cb) {
        listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
      }
    };
  });

  console.log(`[${label}] injected ${w.address}`);
  return w;
}
