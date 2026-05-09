// PM2 ecosystem config for production single-VPS deployment.
// Per PLAN §2.1 / ADR 0001:
//   - apps/web:    cluster ×2-4, max 1GB each
//   - apps/public: cluster ×2-4, max 1GB each
//   - apps/api:    cluster ×2-4, max 1GB each (sticky sessions via nginx ip_hash)
//   - apps/worker: fork ×2, max 2GB each (sharp + Puppeteer can spike memory)
//
// Adjust `instances` based on actual VPS core count.
// Use: pm2 start ecosystem.config.cjs --env production

module.exports = {
  apps: [
    {
      name: "inmolink-web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
      error_file: "./logs/web.err.log",
      out_file: "./logs/web.out.log",
      time: true,
      kill_timeout: 10000, // graceful shutdown window for in-flight requests
      wait_ready: true,
      listen_timeout: 30000,
    },
    {
      name: "inmolink-public",
      cwd: "./apps/public",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
      error_file: "./logs/public.err.log",
      out_file: "./logs/public.out.log",
      time: true,
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 30000,
    },
    {
      name: "inmolink-api",
      cwd: "./apps/api",
      script: "dist/server.js",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
      error_file: "./logs/api.err.log",
      out_file: "./logs/api.out.log",
      time: true,
      kill_timeout: 15000, // longer for in-flight WebSocket drain
      wait_ready: true,
      listen_timeout: 30000,
    },
    {
      name: "inmolink-worker",
      cwd: "./apps/worker",
      script: "dist/worker.js",
      instances: 2,
      // BullMQ workers can run multiple processes safely; each pulls jobs from
      // the shared Redis queue. Fork mode keeps Puppeteer/sharp memory isolated.
      exec_mode: "fork",
      max_memory_restart: "2G",
      env: { NODE_ENV: "production" },
      error_file: "./logs/worker.err.log",
      out_file: "./logs/worker.out.log",
      time: true,
      kill_timeout: 30000, // BullMQ jobs may need longer to drain
    },
  ],
};
