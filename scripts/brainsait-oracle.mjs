#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_EXAMPLE = resolve(ROOT, ".env.example");
const ENV_FILE = resolve(ROOT, ".env");
const DOCKER_COMPOSE_FILE = resolve(ROOT, "docker", "docker-compose.yml");
const PROD_COMPOSE_FILE = resolve(ROOT, "docker-compose.production.yml");
const ORACLE_DATA_DIR = resolve(ROOT, ".data", "oracle");
const BACKUP_DIR = resolve(ROOT, "backups");
const LOCAL_CONTAINER = "brainsait-oracle-dev";

function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { positionals, flags };
}

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return {};

  return readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
    .reduce((accumulator, line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function mergedEnv() {
  return {
    ...process.env,
    ...loadEnvFile(),
  };
}

function exec(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: { ...mergedEnv(), ...(options.env || {}) },
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0 && !options.allowFailure) {
    const stderr = (result.stderr || "").trim();
    throw new Error(stderr || `${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result;
}

function ensureEnvFile() {
  if (existsSync(ENV_FILE)) {
    return false;
  }

  copyFileSync(ENV_EXAMPLE, ENV_FILE);
  return true;
}

function printUsage() {
  console.log(`brainsait-oracle

Usage:
  brainsait-oracle configure
  brainsait-oracle deploy --target <local-dev|portals|scanner|platform> [--dry-run]
  brainsait-oracle status [--format json] [--skip-remote]
  brainsait-oracle backup [--output <path>]
  brainsait-oracle migrate --file <sql-file> [--dry-run]
  brainsait-oracle resubmission-plan --claim-response <file.xlsx> --ministry <file.xlsx> [--output-dir <dir>]
`);
}

function formatStatus(format, payload) {
  if (format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Environment file: ${payload.environmentFile}`);
  console.log(`Local Oracle container: ${payload.localOracle.exists ? payload.localOracle.health : "missing"}`);
  console.log(`Local Oracle port: ${payload.localOracle.port || "n/a"}`);
  console.log(`Portal summary URL: ${payload.remote.portalSummary}`);
  console.log(`Scanner health URL: ${payload.remote.scannerHealth}`);
}

function configureCommand() {
  const created = ensureEnvFile();
  mkdirSync(ORACLE_DATA_DIR, { recursive: true });
  console.log(created ? "Created .env from .env.example" : ".env already present");
}

function deployCommand(flags) {
  const target = flags.target || "local-dev";
  const dryRun = flags["dry-run"] === true;

  if (target === "local-dev") {
    ensureEnvFile();
    mkdirSync(ORACLE_DATA_DIR, { recursive: true });
    if (dryRun) {
      console.log(`docker compose -f ${DOCKER_COMPOSE_FILE} up -d`);
      return;
    }

    exec("docker", ["compose", "-f", DOCKER_COMPOSE_FILE, "up", "-d"]);
    return;
  }

  if (target === "platform") {
    if (dryRun) {
      console.log(`docker compose -f ${PROD_COMPOSE_FILE} up -d`);
      return;
    }

    exec("docker", ["compose", "-f", PROD_COMPOSE_FILE, "up", "-d"]);
    return;
  }

  if (target === "portals") {
    if (dryRun) {
      console.log("npx wrangler deploy --config wrangler.toml");
      return;
    }

    exec("npx", ["wrangler", "deploy", "--config", "wrangler.toml"]);
    return;
  }

  if (target === "scanner") {
    if (dryRun) {
      console.log("npx wrangler deploy --config wrangler.scanner.toml");
      return;
    }

    exec("npx", ["wrangler", "deploy", "--config", "wrangler.scanner.toml"]);
    return;
  }

  throw new Error(`Unsupported deploy target: ${target}`);
}

function statusCommand(flags) {
  const format = flags.format || "text";
  const skipRemote = flags["skip-remote"] === true;
  const inspect = exec("docker", ["inspect", LOCAL_CONTAINER, "--format", "{{json .State.Health}}"], {
    capture: true,
    allowFailure: true,
  });

  const env = mergedEnv();
  const payload = {
    generatedAt: new Date().toISOString(),
    environmentFile: existsSync(ENV_FILE) ? ".env" : "missing",
    localOracle: {
      exists: inspect.status === 0,
      health: inspect.status === 0 ? JSON.parse(inspect.stdout.trim() || "{}")?.Status || "unknown" : "missing",
      port: env.ORACLE_PORT || "1521",
    },
    remote: {
      portalSummary: "https://portals.elfadil.com/api/control-tower/summary",
      scannerHealth: "https://oracle-scanner.elfadil.com/health",
      skipped: skipRemote,
    },
  };

  formatStatus(format, payload);
}

function backupCommand(flags) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const output = resolve(ROOT, flags.output || `backups/oracle-dev-${timestamp}.tgz`);

  if (!existsSync(ORACLE_DATA_DIR)) {
    throw new Error("No Oracle data directory exists yet. Start the local developer stack first.");
  }

  exec("tar", ["-czf", output, "-C", resolve(ROOT, ".data"), "oracle"]);
  console.log(output);
}

function migrateCommand(flags) {
  const sqlFile = flags.file;
  const dryRun = flags["dry-run"] === true;
  const env = mergedEnv();

  if (!sqlFile) {
    throw new Error("migrate requires --file <sql-file>");
  }

  const resolvedFile = resolve(ROOT, sqlFile);
  const command = `docker exec -i ${LOCAL_CONTAINER} bash -lc \"sqlplus -s system/${env.ORACLE_PASSWORD || "oracle_dev_password"}@localhost/${env.ORACLE_PDB || "FREEPDB1"} @/dev/stdin\" < ${resolvedFile}`;

  if (dryRun) {
    console.log(command);
    return;
  }

  exec("bash", ["-lc", command]);
}

function resubmissionPlanCommand() {
  exec("node", ["scripts/build-resubmission-plan.mjs", ...process.argv.slice(3)]);
}

function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0] || "help";

  switch (command) {
    case "configure":
      configureCommand();
      break;
    case "deploy":
      deployCommand(flags);
      break;
    case "status":
      statusCommand(flags);
      break;
    case "backup":
      backupCommand(flags);
      break;
    case "migrate":
      migrateCommand(flags);
      break;
    case "resubmission-plan":
      resubmissionPlanCommand();
      break;
    case "help":
    case "--help":
    case "-h":
      printUsage();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
