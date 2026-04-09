#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const NORMALIZER_PATH = path.join(ROOT_DIR, "scripts", "normalize_token_config.py");
const TEMPLATE_DIR = path.join(ROOT_DIR, "assets", "foundry-template");
const KNOWN_CHAIN_NAMES = new Map([
  [1, "ethereum"],
  [10, "optimism"],
  [137, "polygon"],
  [8453, "base"],
  [42161, "arbitrum"],
  [11155111, "sepolia"],
  [31337, "anvil"],
]);

function usage() {
  return `Usage:
  token-deployer normalize <request.json> [--out <path>]
  token-deployer scaffold <request.json> [--target-dir <dir>] [--force]
  token-deployer deploy <request.json> [--target-dir <dir>] [--force] [--broadcast] [--verify] [--rpc-url <url>] [--private-key <hex>]

Notes:
  - deploy without --broadcast performs scaffold + forge build + forge test + forge script simulation
  - deploy with --broadcast also submits the transaction and writes a deployment manifest
  - request.json should match the fields described in SKILL.md and references/hermes-runtime.md
`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    return { command: "help" };
  }

  const positional = [];
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    if (["force", "broadcast", "verify"].includes(key)) {
      options[key] = true;
      continue;
    }

    const value = rest[i + 1];
    if (value === undefined) {
      throw new Error(`missing value for --${key}`);
    }
    options[key] = value;
    i += 1;
  }

  return { command, positional, options };
}

function runCommand(command, args, { cwd = ROOT_DIR, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
  });

  if (result.error && result.status === null) {
    throw result.error;
  }

  if (result.status !== 0) {
    const message = [
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(message);
  }

  return result.stdout;
}

function resolvePython() {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) {
      return candidate;
    }
  }
  throw new Error("python3 or python is required to run the request normalizer");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function shellQuote(value) {
  const stringValue = String(value ?? "");
  return `'${stringValue.replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeChainName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseChainId(value, fieldName = "chainId") {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) {
      return value;
    }
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    let parsed = Number.NaN;
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
      parsed = Number.parseInt(trimmed, 16);
    } else if (/^\d+$/.test(trimmed)) {
      parsed = Number.parseInt(trimmed, 10);
    }

    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  throw new Error(`${fieldName} must be a non-negative integer`);
}

function getKnownChainName(chainId) {
  if (chainId === null) {
    return null;
  }
  return KNOWN_CHAIN_NAMES.get(chainId) ?? null;
}

function chainNamesMatch(requestedChainName, actualChainName) {
  return slugify(requestedChainName) === slugify(actualChainName);
}

async function fetchRpcChainId(rpcUrl, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is required to resolve the RPC chainId");
  }

  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC chainId lookup failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    const reason = payload.error.message ?? JSON.stringify(payload.error);
    throw new Error(`RPC chainId lookup failed: ${reason}`);
  }

  return parseChainId(payload?.result, "RPC chainId");
}

function resolveChainMetadata(normalized, { broadcast = false, actualChainId = null } = {}) {
  const requestedChainId = parseChainId(normalized.chainId, "chainId");
  const requestedChainName = normalizeChainName(normalized.chainName);
  const warnings = [];

  if (!broadcast) {
    const chainName = requestedChainName ?? getKnownChainName(requestedChainId);
    return {
      chainId: requestedChainId,
      chainName,
      chainSlug: chainName ? slugify(chainName) : String(requestedChainId ?? "unknown"),
      warnings,
    };
  }

  if (actualChainId === null) {
    throw new Error("broadcast requires an authoritative RPC chainId");
  }

  if (requestedChainId !== null && requestedChainId !== actualChainId) {
    throw new Error(`request chainId ${requestedChainId} does not match RPC chainId ${actualChainId}`);
  }

  const canonicalChainName = getKnownChainName(actualChainId);
  if (requestedChainName && !canonicalChainName) {
    throw new Error(
      `request chainName "${requestedChainName}" cannot be verified for RPC chainId ${actualChainId}; omit chainName or add a canonical mapping before broadcast`,
    );
  }
  if (requestedChainName && canonicalChainName && !chainNamesMatch(requestedChainName, canonicalChainName)) {
    throw new Error(
      `request chainName "${requestedChainName}" does not match RPC chain "${canonicalChainName}" for chainId ${actualChainId}`,
    );
  }

  const chainName = canonicalChainName;
  return {
    chainId: actualChainId,
    chainName,
    chainSlug: chainName ? slugify(chainName) : String(actualChainId),
    warnings,
  };
}

function normalizeRequest(requestPath, outPath) {
  const python = resolvePython();
  const args = [NORMALIZER_PATH, requestPath];
  if (outPath) {
    args.push("--out", outPath);
    runCommand(python, args);
    return readJson(outPath);
  }

  const stdout = runCommand(python, args);
  return JSON.parse(stdout);
}

function resolveRpcUrl(options = {}) {
  return options["rpc-url"] ?? process.env.RPC_URL ?? null;
}

function resolvePrivateKey(options = {}) {
  return options["private-key"] ?? process.env.PRIVATE_KEY ?? null;
}

function ensureDirectory(targetDir, { force = false } = {}) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(targetDir);
  if (entries.length > 0 && !force) {
    throw new Error(`target directory is not empty: ${targetDir}. Pass --force to reuse it.`);
  }

  if (entries.length > 0 && force) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

function buildWorkspaceDir(normalized, targetDir) {
  if (targetDir) {
    return path.resolve(targetDir);
  }

  const slug = slugify(`${normalized.standard}-${normalized.name}`);
  return path.join(os.tmpdir(), "defi-token-deployer", slug);
}

function buildEnvTemplate(normalized) {
  const lines = [
    "# Non-secret values generated from the normalized request.",
    "# Provide RPC_URL and PRIVATE_KEY at runtime instead of storing them here.",
    "",
  ];

  if (normalized.standard === "erc20") {
    lines.push(`ERC20_NAME=${shellQuote(normalized.name)}`);
    lines.push(`ERC20_SYMBOL=${shellQuote(normalized.symbol)}`);
    lines.push(`ERC20_DECIMALS=${shellQuote(normalized.decimals)}`);
    lines.push(`INITIAL_OWNER=${shellQuote(normalized.owner)}`);
    lines.push(`INITIAL_RECIPIENT=${shellQuote(normalized.initialRecipient)}`);
    lines.push(`INITIAL_SUPPLY=${shellQuote(normalized.initialSupply)}`);
    lines.push(`ERC20_MINTING_ENABLED=${shellQuote(normalized.features.mintable ? "true" : "false")}`);
  } else {
    lines.push(`ERC721_NAME=${shellQuote(normalized.name)}`);
    lines.push(`ERC721_SYMBOL=${shellQuote(normalized.symbol)}`);
    lines.push(`INITIAL_OWNER=${shellQuote(normalized.owner)}`);
    lines.push(`ERC721_BASE_URI=${shellQuote(normalized.baseURI ?? "")}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildRuntimeEnv(normalized, options) {
  const env = { ...process.env };
  const rpcUrl = resolveRpcUrl(options);
  const requestedPrivateKey = resolvePrivateKey(options);
  const simulationPrivateKey =
    requestedPrivateKey ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  if (rpcUrl) {
    env.RPC_URL = rpcUrl;
  }

  env.PRIVATE_KEY = options.broadcast ? requestedPrivateKey ?? "" : simulationPrivateKey;

  if (normalized.standard === "erc20") {
    env.ERC20_NAME = normalized.name;
    env.ERC20_SYMBOL = normalized.symbol;
    env.ERC20_DECIMALS = String(normalized.decimals);
    env.INITIAL_OWNER = normalized.owner;
    env.INITIAL_RECIPIENT = normalized.initialRecipient;
    env.INITIAL_SUPPLY = normalized.initialSupply ?? "0";
    env.ERC20_MINTING_ENABLED = normalized.features.mintable ? "true" : "false";
  } else {
    env.ERC721_NAME = normalized.name;
    env.ERC721_SYMBOL = normalized.symbol;
    env.INITIAL_OWNER = normalized.owner;
    env.ERC721_BASE_URI = normalized.baseURI ?? "";
  }

  return { env, rpcUrl, requestedPrivateKey };
}

function buildDeployCommand(normalized, { rpcUrl = null, broadcast = false, verify = false } = {}) {
  const scriptSpec =
    normalized.standard === "erc20"
      ? "script/DeployDefiCompatibleERC20.s.sol:DeployDefiCompatibleERC20"
      : "script/DeployDefiCompatibleERC721.s.sol:DeployDefiCompatibleERC721";

  const args = ["script", scriptSpec];
  if (rpcUrl) {
    args.push("--rpc-url", rpcUrl);
  }
  if (broadcast) {
    args.push("--broadcast");
  }
  if (verify) {
    args.push("--verify");
  }
  return args;
}

function scaffoldWorkspace(requestPath, options = {}) {
  const normalized = normalizeRequest(requestPath);
  if (normalized.blockingIssues?.length) {
    const error = new Error("request is blocked by compatibility issues");
    error.details = normalized;
    throw error;
  }

  const workspaceDir = buildWorkspaceDir(normalized, options["target-dir"]);
  ensureDirectory(workspaceDir, { force: Boolean(options.force) });
  fs.cpSync(TEMPLATE_DIR, workspaceDir, { recursive: true, force: true });

  const requestCopyPath = path.join(workspaceDir, "token-deployer.request.json");
  const normalizedPath = path.join(workspaceDir, "token-deployer.normalized.json");
  const envTemplatePath = path.join(workspaceDir, ".env.token-deployer");

  fs.copyFileSync(path.resolve(requestPath), requestCopyPath);
  writeJson(normalizedPath, normalized);
  fs.writeFileSync(envTemplatePath, buildEnvTemplate(normalized));

  const result = {
    status: "scaffolded",
    standard: normalized.standard,
    workspaceDir,
    requestPath: requestCopyPath,
    normalizedPath,
    envTemplatePath,
    buildCommand: ["forge", "build"],
    testCommand: ["forge", "test"],
    deployCommand: [
      "forge",
      ...buildDeployCommand(normalized, {
        rpcUrl: resolveRpcUrl(options),
        broadcast: Boolean(options.broadcast),
        verify: Boolean(options.verify),
      }),
    ],
    warnings: normalized.warnings ?? [],
    compatibility: normalized.compatibility,
  };

  return { normalized, workspaceDir, envTemplatePath, result };
}

function findLatestBroadcastArtifact(workspaceDir, normalized, chainId = null) {
  const scriptDir =
    normalized.standard === "erc20" ? "DeployDefiCompatibleERC20.s.sol" : "DeployDefiCompatibleERC721.s.sol";
  const baseDir = path.join(workspaceDir, "broadcast", scriptDir);
  if (!fs.existsSync(baseDir)) {
    return null;
  }

  if (chainId !== null) {
    const exactMatch = path.join(baseDir, String(chainId), "run-latest.json");
    return fs.existsSync(exactMatch) ? exactMatch : null;
  }

  const candidates = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(baseDir, entry.name, "run-latest.json");
    if (fs.existsSync(candidate)) {
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return candidates[0] ?? null;
}

function extractDeploymentFromArtifact(artifactPath) {
  const artifact = readJson(artifactPath);
  const transactions = Array.isArray(artifact.transactions) ? artifact.transactions : [];
  const receipts = Array.isArray(artifact.receipts) ? artifact.receipts : [];
  const createTx = [...transactions].reverse().find((item) => item.transactionType === "CREATE");
  const matchingReceipt =
    createTx?.contractAddress !== undefined
      ? [...receipts]
          .reverse()
          .find(
            (item) =>
              typeof item.contractAddress === "string" &&
              item.contractAddress.toLowerCase() === createTx.contractAddress.toLowerCase(),
          ) ?? null
      : receipts.at(-1) ?? null;

  return {
    artifactPath,
    txHash: createTx?.hash ?? null,
    deployedAddress: createTx?.contractAddress ?? null,
    deployer: createTx?.transaction?.from ?? matchingReceipt?.from ?? null,
    chainId: parseChainId(artifact.chain ?? createTx?.transaction?.chainId ?? null, "artifact chainId"),
  };
}

async function deployRequest(requestPath, options = {}) {
  const { normalized, workspaceDir, envTemplatePath, result } = scaffoldWorkspace(requestPath, options);
  const { env, rpcUrl, requestedPrivateKey } = buildRuntimeEnv(normalized, options);
  const broadcast = Boolean(options.broadcast);
  const verify = Boolean(options.verify);
  let actualChainId = null;

  if (broadcast && !rpcUrl) {
    throw new Error("broadcast requires --rpc-url or RPC_URL");
  }
  if (broadcast && !requestedPrivateKey) {
    throw new Error("broadcast requires --private-key or PRIVATE_KEY");
  }
  if (broadcast) {
    actualChainId = await fetchRpcChainId(rpcUrl);
  }

  const chainMetadata = resolveChainMetadata(normalized, { broadcast, actualChainId });

  runCommand("forge", ["build"], { cwd: workspaceDir, env });
  runCommand("forge", ["test"], { cwd: workspaceDir, env });
  runCommand("forge", buildDeployCommand(normalized, { rpcUrl, broadcast, verify }), {
    cwd: workspaceDir,
    env,
  });

  let deployment = {
    txHash: null,
    deployedAddress: null,
    artifactPath: null,
    deployer: null,
    chainId: chainMetadata.chainId,
  };

  if (broadcast) {
    const artifactPath = findLatestBroadcastArtifact(workspaceDir, normalized, actualChainId);
    if (artifactPath) {
      deployment = extractDeploymentFromArtifact(artifactPath);
    }
    if (!deployment.artifactPath || !deployment.txHash || !deployment.deployedAddress) {
      throw new Error("broadcast completed without a parseable deployment artifact");
    }
    if (deployment.chainId === null) {
      throw new Error("broadcast artifact did not include a chain id");
    }
    if (deployment.chainId !== actualChainId) {
      throw new Error(`broadcast artifact chain ${deployment.chainId} does not match RPC chain ${actualChainId}`);
    }
  }

  const manifestPath = path.join(workspaceDir, "deployments", chainMetadata.chainSlug, `${slugify(normalized.name)}.json`);

  const manifest = {
    status: broadcast ? "deployed" : "simulated",
    standard: normalized.standard,
    name: normalized.name,
    symbol: normalized.symbol,
    chainId: chainMetadata.chainId,
    chainName: chainMetadata.chainName,
    workspaceDir,
    envTemplatePath,
    requestPath: result.requestPath,
    normalizedPath: result.normalizedPath,
    contractName: normalized.contractName,
    deployer: broadcast ? deployment.deployer : "simulation",
    owner: normalized.owner,
    constructorArgs:
      normalized.standard === "erc20"
        ? {
            name: normalized.name,
            symbol: normalized.symbol,
            decimals: normalized.decimals,
            initialOwner: normalized.owner,
            initialRecipient: normalized.initialRecipient,
            initialSupply: normalized.initialSupply,
            mintingEnabled: normalized.features.mintable,
          }
        : {
            name: normalized.name,
            symbol: normalized.symbol,
            initialOwner: normalized.owner,
            baseURI: normalized.baseURI ?? "",
          },
    deployCommand: ["forge", ...buildDeployCommand(normalized, { rpcUrl, broadcast, verify })],
    verification: {
      requested: verify,
      status: verify && broadcast ? "requested-via-forge" : "not-requested",
    },
    warnings: [...(normalized.warnings ?? []), ...chainMetadata.warnings],
    compatibility: normalized.compatibility,
    txHash: deployment.txHash,
    deployedAddress: deployment.deployedAddress,
    artifactPath: deployment.artifactPath,
  };

  writeJson(manifestPath, manifest);
  manifest.manifestPath = manifestPath;
  return manifest;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printError(error) {
  const payload = {
    status: "error",
    message: error.message,
    details: error.details ?? null,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));

    if (parsed.command === "help") {
      process.stdout.write(usage());
      return;
    }

    const requestPath = parsed.positional[0];
    if (!requestPath) {
      throw new Error("request.json path is required");
    }

    if (parsed.command === "normalize") {
      const normalized = normalizeRequest(requestPath, parsed.options.out);
      if (!parsed.options.out) {
        printJson(normalized);
      }
      return;
    }

    if (parsed.command === "scaffold") {
      const result = scaffoldWorkspace(requestPath, parsed.options).result;
      printJson(result);
      return;
    }

    if (parsed.command === "deploy") {
      const manifest = await deployRequest(requestPath, parsed.options);
      printJson(manifest);
      return;
    }

    throw new Error(`unknown command: ${parsed.command}`);
  } catch (error) {
    printError(error);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    printError(error);
    process.exit(1);
  });
}

export {
  buildDeployCommand,
  buildEnvTemplate,
  deployRequest,
  extractDeploymentFromArtifact,
  fetchRpcChainId,
  chainNamesMatch,
  normalizeRequest,
  parseChainId,
  resolvePrivateKey,
  resolveChainMetadata,
  resolveRpcUrl,
  shellQuote,
};
