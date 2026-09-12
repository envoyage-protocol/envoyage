// pm2 process file for the judging window. Both processes read ../.env.
//   pm2 start ecosystem.config.cjs && pm2 save
// The keeper compounds whatever the subgraph says needs it; the swap loop is the
// market that makes there be something to compound. One without the other is a
// demo that never moves.
const path = require("path");
const root = path.resolve(__dirname, "..");
const env = require("dotenv").config({path: path.join(root, ".env")}).parsed || {};

module.exports = {
  apps: [
    {
      name: "envoyage-keeper",
      cwd: __dirname,
      script: "npx",
      args: "tsx src/index.ts",
      env: {...env, POLL_MS: "30000"},
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 50
    },
    {
      name: "envoyage-swap-loop",
      cwd: __dirname,
      script: "npx",
      args: "tsx src/swap-loop.ts",
      // 30 min, not 2. At a 2-minute cadence with a 60-second mandate cooldown the
      // keeper compounded ~120x/hour across two mandates and spent its whole balance
      // overnight (246 executions, ~0.09 ETH). Fee accrual is what gates compounding,
      // so the swap cadence is the throttle for the entire system.
      // For recording, restart this one process with SWAP_CADENCE_MS=60000.
      env: {...env, SWAP_CADENCE_MS: "1800000"},
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 50
    }
  ]
};
