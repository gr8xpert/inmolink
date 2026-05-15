#!/usr/bin/env node
/**
 * Cross-platform `rm -rf` for package.json `clean` scripts.
 *
 * Usage: node ../../scripts/clean.mjs .next .turbo node_modules
 *
 * Paths are resolved relative to the invoking process's working directory
 * (pnpm runs scripts with the package directory as cwd). Missing paths are
 * silently skipped — that's the `-f` semantic.
 */
import fs from "node:fs";
import path from "node:path";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("clean.mjs: no paths provided");
  process.exit(1);
}

for (const t of targets) {
  const abs = path.resolve(process.cwd(), t);
  try {
    fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    console.error(`clean.mjs: failed to remove ${abs}:`, err.message);
    process.exitCode = 1;
  }
}
