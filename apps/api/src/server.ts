import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main() {
  const env = loadConfig();
  const app = await buildApp(env);

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down gracefully");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      { port: env.PORT, host: env.HOST, env: env.NODE_ENV },
      "Inmolink API listening",
    );
  } catch (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsoleLog: bootstrap error before logger
  console.error("Fatal startup error:", err);
  process.exit(1);
});
