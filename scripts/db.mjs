#!/usr/bin/env node
/**
 * Local PostgreSQL controller for Visit Imedwan development/tests.
 *
 * Uses the `embedded-postgres` package (real PostgreSQL 17 binaries) so the
 * project can run without a system-wide PostgreSQL installation.
 *
 * Usage:
 *   npm run db:start    # initialise (first run) + start + create databases
 *   npm run db:stop     # stop the server
 *   npm run db:status    # check whether it is running
 *
 * Data lives in .data/pg (gitignored). Port 5433 avoids clashing with any
 * system PostgreSQL.
 */
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PORT = Number(process.env.DB_PORT ?? 5433);
const USER = "postgres";
const PASSWORD = "postgres";
const DATABASES = ["visit_imedwan", "visit_imedwan_test"];

const databaseDir = path.join(root, ".data", "pg");

function log(msg) {
  console.log(`[db] ${msg}`);
}

function checkPort(port, timeout = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (up) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function getEmbedded() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  return new EmbeddedPostgres({
    databaseDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });
}

async function ensureDatabases(pg) {
  for (const name of DATABASES) {
    try {
      await pg.createDatabase(name);
      log(`created database "${name}"`);
    } catch {
      // Already exists (or server-managed) — idempotent by design.
    }
  }
}

async function start() {
  if (await checkPort(PORT)) {
    log(`already running on port ${PORT}`);
    const pg = await getEmbedded();
    await ensureDatabases(pg);
    return;
  }
  const pg = await getEmbedded();
  try {
    await pg.start();
    log(`started on port ${PORT}`);
  } catch (err) {
    if (String(err).includes("already")) {
      log(`already running on port ${PORT}`);
    } else {
      // First run: initialise the data directory, then start.
      log("initialising data directory (first run)...");
      await pg.initialise();
      await pg.start();
      log(`started on port ${PORT}`);
    }
  }
  await ensureDatabases(pg);
  log(`databases ready: ${DATABASES.join(", ")}`);
}

async function stop() {
  if (!(await checkPort(PORT))) {
    log("not running");
    return;
  }
  const pg = await getEmbedded();
  await pg.stop();
  log("stopped");
}

async function status() {
  const up = await checkPort(PORT);
  log(up ? `running on port ${PORT}` : `not running (port ${PORT})`);
  process.exitCode = up ? 0 : 1;
}

const cmd = process.argv[2] ?? "start";
try {
  if (cmd === "start") await start();
  else if (cmd === "stop") await stop();
  else if (cmd === "status") await status();
  else {
    log(`unknown command "${cmd}" (expected start|stop|status)`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`[db] failed:`, err?.message ?? err);
  process.exitCode = 1;
}
