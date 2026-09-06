# Envoyage web

Reads Sepolia directly over two independent RPC operators. No indexer, no backend,
no API key — so it works during a demo even if a service is down.

```bash
npm install
npm run dev
```

## Why it reads the chain rather than the subgraph

The subgraph exists and its handlers are tested, but Studio deployment is blocked on
a deploy key. Rather than ship a page that shows nothing until that arrives, the UI
reads contract state and `MandateExecuted` logs directly. When the subgraph is live
it becomes a second source for history, not a prerequisite for the page loading.

## One implementation note worth keeping

`REFUSAL_REASONS` derives its error selectors from signatures at runtime with
`toFunctionSelector`, rather than storing hex constants. The first draft hard-coded
them from memory and four of six were wrong — and the failure mode is invisible: a
mismatched selector renders "unknown reason" while the contract is behaving
perfectly. Anything derivable from the ABI should be derived from it.
