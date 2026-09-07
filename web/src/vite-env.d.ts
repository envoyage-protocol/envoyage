/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUBGRAPH_URL?: string;
  readonly VITE_GRAPH_GATEWAY_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
