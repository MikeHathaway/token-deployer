import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDeployCommand,
  buildDeploymentManifest,
  buildEnvTemplate,
  chainNamesMatch,
  deployRequest,
  extractDeploymentFromArtifact,
  extractMintResultFromReceipt,
  fetchRpcChainId,
  loadBroadcastDeployment,
  normalizeRequest,
  parseUintString,
  resolveChainMetadata,
} from "../scripts/token-deployer.mjs";

test("buildEnvTemplate shell-quotes values with spaces", () => {
  const template = buildEnvTemplate({
    standard: "erc20",
    name: "Rapid Token",
    symbol: "RAPID",
    decimals: 18,
    owner: "0x1111111111111111111111111111111111111111",
    initialRecipient: "0x2222222222222222222222222222222222222222",
    initialSupply: "1000000000000000000",
    features: {
      mintable: false,
    },
  });

  assert.match(template, /ERC20_NAME='Rapid Token'/);
  assert.match(template, /INITIAL_SUPPLY='1000000000000000000'/);
});

test("buildEnvTemplate escapes single quotes safely", () => {
  const template = buildEnvTemplate({
    standard: "erc721",
    name: "Collector's Item",
    symbol: "NFT",
    owner: "0x1111111111111111111111111111111111111111",
    baseURI: "ipfs://collection's-root/",
  });

  assert.match(template, /ERC721_NAME='Collector'"'"'s Item'/);
  assert.match(template, /ERC721_BASE_URI='ipfs:\/\/collection'"'"'s-root\/'/);
});

test("buildDeployCommand includes rpc-url when resolved from env or flags", () => {
  const command = buildDeployCommand(
    { standard: "erc20" },
    { rpcUrl: "http://127.0.0.1:8545", broadcast: true, verify: true },
  );

  assert.deepEqual(command, [
    "script",
    "script/DeployDefiCompatibleERC20.s.sol:DeployDefiCompatibleERC20",
    "--rpc-url",
    "http://127.0.0.1:8545",
    "--broadcast",
    "--verify",
  ]);
});

test("fetchRpcChainId parses hex chain ids from JSON-RPC", async () => {
  const chainId = await fetchRpcChainId("http://rpc.example", async () => ({
    ok: true,
    status: 200,
    async json() {
      return { jsonrpc: "2.0", id: 1, result: "0x2105" };
    },
  }));

  assert.equal(chainId, 8453);
});

test("resolveChainMetadata uses canonical broadcast chain metadata", () => {
  const resolved = resolveChainMetadata({ chainId: "8453", chainName: "base" }, { broadcast: true, actualChainId: 8453 });

  assert.equal(resolved.chainId, 8453);
  assert.equal(resolved.chainName, "base");
  assert.equal(resolved.chainSlug, "base");
  assert.deepEqual(resolved.warnings, []);
});

test("resolveChainMetadata rejects RPC and request chain mismatches", () => {
  assert.throws(
    () => resolveChainMetadata({ chainId: 8453 }, { broadcast: true, actualChainId: 31337 }),
    /request chainId 8453 does not match RPC chainId 31337/,
  );
});

test("resolveChainMetadata rejects chainName-only mismatches", () => {
  assert.throws(
    () => resolveChainMetadata({ chainName: "base" }, { broadcast: true, actualChainId: 31337 }),
    /request chainName "base" does not match RPC chain "anvil" for chainId 31337/,
  );
});

test("resolveChainMetadata requires a request chain selector", () => {
  assert.throws(
    () => resolveChainMetadata({}, { broadcast: true, actualChainId: 31337 }),
    /request chainId or chainName is required/,
  );
});

test("resolveChainMetadata rejects unverifiable chainName on unmapped broadcast chains", () => {
  assert.throws(
    () => resolveChainMetadata({ chainId: 56, chainName: "base" }, { broadcast: true, actualChainId: 56 }),
    /request chainName "base" cannot be verified for RPC chainId 56; omit chainName or add a canonical mapping before broadcast/,
  );
});

test("resolveChainMetadata uses chainId slug for unmapped broadcast chains without chainName", () => {
  const resolved = resolveChainMetadata({ chainId: 56 }, { broadcast: true, actualChainId: 56 });

  assert.equal(resolved.chainId, 56);
  assert.equal(resolved.chainName, null);
  assert.equal(resolved.chainSlug, "56");
  assert.deepEqual(resolved.warnings, []);
});

test("chainNamesMatch normalizes case and spacing", () => {
  assert.equal(chainNamesMatch("Base", "base"), true);
  assert.equal(chainNamesMatch("  base  ", "base"), true);
  assert.equal(chainNamesMatch("base", "anvil"), false);
});

test("extractDeploymentFromArtifact returns deployer and chain metadata", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-artifact-"));
  const artifactPath = path.join(tempDir, "run-latest.json");
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        chain: 31337,
        transactions: [
          {
            hash: "0xabc",
            transactionType: "CREATE",
            contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
            transaction: {
              from: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
              chainId: "0x7a69",
            },
          },
        ],
        receipts: [
          {
            from: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
            contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
          },
        ],
      },
      null,
      2,
    ),
  );

  const deployment = extractDeploymentFromArtifact(artifactPath);
  assert.equal(deployment.txHash, "0xabc");
  assert.equal(deployment.deployedAddress, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
  assert.equal(deployment.deployer, "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  assert.equal(deployment.chainId, 31337);
});

test("loadBroadcastDeployment validates a recovered broadcast artifact", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-artifact-"));
  const artifactPath = path.join(
    tempDir,
    "broadcast",
    "DeployDefiCompatibleERC20.s.sol",
    "31337",
    "run-latest.json",
  );
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        chain: 31337,
        transactions: [
          {
            hash: "0xabc",
            transactionType: "CREATE",
            contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
            transaction: {
              from: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
              chainId: "0x7a69",
            },
          },
        ],
        receipts: [
          {
            from: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
            contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
          },
        ],
      },
      null,
      2,
    ),
  );

  const deployment = loadBroadcastDeployment(tempDir, { standard: "erc20" }, 31337);
  assert.equal(deployment.txHash, "0xabc");
  assert.equal(deployment.deployedAddress, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
  assert.equal(deployment.deployer, "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  assert.equal(deployment.chainId, 31337);
});

test("buildDeploymentManifest can record verification failures after broadcast", () => {
  const manifest = buildDeploymentManifest({
    normalized: {
      standard: "erc20",
      name: "Verify Token",
      symbol: "VERIFY",
      contractName: "VerifyToken",
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: "1000",
      decimals: 18,
      features: { mintable: false },
      compatibility: {
        ajna: { status: "compatible", notes: [] },
        uniswap: { status: "compatible", notes: [] },
      },
    },
    workspaceDir: "/tmp/workspace",
    envTemplatePath: "/tmp/workspace/.env.token-deployer",
    result: {
      requestPath: "/tmp/workspace/token-deployer.request.json",
      normalizedPath: "/tmp/workspace/token-deployer.normalized.json",
    },
    chainMetadata: {
      chainId: 31337,
      chainName: "anvil",
      chainSlug: "anvil",
      warnings: [],
    },
    broadcast: true,
    verify: true,
    rpcUrl: "http://rpc.example",
    deployment: {
      txHash: "0xabc",
      deployedAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      artifactPath: "/tmp/workspace/broadcast/run-latest.json",
      deployer: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      chainId: 31337,
    },
    warnings: ["broadcast succeeded but verification failed; manifest was preserved for recovery"],
    verification: {
      requested: true,
      status: "failed-after-broadcast",
      error: "verification failed",
    },
  });

  assert.equal(manifest.status, "deployed");
  assert.equal(manifest.verification.status, "failed-after-broadcast");
  assert.match(manifest.verification.error, /verification failed/);
});

test("parseUintString accepts decimal and hex uints", () => {
  assert.equal(parseUintString("42", "amount"), "42");
  assert.equal(parseUintString("0x2a", "amount"), "42");
  assert.equal(parseUintString(42, "amount"), "42");
});

test("extractMintResultFromReceipt parses erc20 mint amount", () => {
  const receipt = {
    logs: [
      {
        address: "0x5555555555555555555555555555555555555555",
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000002222222222222222222222222222222222222222",
        ],
        data: "0x00000000000000000000000000000000000000000000000000000000000003e8",
      },
    ],
  };

  const result = extractMintResultFromReceipt(receipt, {
    standard: "erc20",
    contractAddress: "0x5555555555555555555555555555555555555555",
    recipient: "0x2222222222222222222222222222222222222222",
  });

  assert.deepEqual(result, { amount: "1000" });
});

test("extractMintResultFromReceipt parses erc721 token ids", () => {
  const receipt = {
    logs: [
      {
        address: "0x5555555555555555555555555555555555555555",
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000002222222222222222222222222222222222222222",
          "0x0000000000000000000000000000000000000000000000000000000000000007",
        ],
        data: "0x",
      },
    ],
  };

  const result = extractMintResultFromReceipt(receipt, {
    standard: "erc721",
    contractAddress: "0x5555555555555555555555555555555555555555",
    recipient: "0x2222222222222222222222222222222222222222",
  });

  assert.deepEqual(result, { tokenId: "7" });
});

test("extractMintResultFromReceipt rejects receipts without a matching mint log", () => {
  assert.throws(
    () =>
      extractMintResultFromReceipt(
        {
          logs: [
            {
              address: "0x5555555555555555555555555555555555555555",
              topics: [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000003333333333333333333333333333333333333333",
              ],
              data: "0x01",
            },
          ],
        },
        {
          standard: "erc20",
          contractAddress: "0x5555555555555555555555555555555555555555",
          recipient: "0x2222222222222222222222222222222222222222",
        },
      ),
    /did not include a matching Transfer event/,
  );
});

test("normalizeRequest blocks permit until a permit-capable template exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-request-"));
  const requestPath = path.join(tempDir, "request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "Permit Token",
      symbol: "PERMIT",
      chainId: 8453,
      chainName: "base",
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: "1000",
      decimals: 18,
      mintable: false,
      permit: true,
    }),
  );

  const normalized = normalizeRequest(requestPath);
  assert.equal(normalized.features.permit, true);
  assert.equal(normalized.compatibility.ajna.status, "blocked");
  assert.equal(normalized.compatibility.uniswap.status, "blocked");
  assert.match(
    normalized.blockingIssues.join("\n"),
    /permit=true is not supported by the bundled ERC20 template/,
  );
});

test("normalizeRequest blocks requests that omit both chainId and chainName", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-request-"));
  const requestPath = path.join(tempDir, "request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "No Chain Binding",
      symbol: "NCB",
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: "1000",
      decimals: 18,
      mintable: false,
    }),
  );

  const normalized = normalizeRequest(requestPath);
  assert.equal(normalized.compatibility.ajna.status, "blocked");
  assert.equal(normalized.compatibility.uniswap.status, "blocked");
  assert.match(normalized.blockingIssues.join("\n"), /chainId or chainName is required/);
});

test("normalizeRequest blocks booleans in numeric fields", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-request-"));
  const requestPath = path.join(tempDir, "request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "Boolean Token",
      symbol: "BOOL",
      chainId: 31337,
      chainName: "anvil",
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: true,
      decimals: false,
      mintable: false,
    }),
  );

  const normalized = normalizeRequest(requestPath);
  assert.equal(normalized.compatibility.ajna.status, "blocked");
  assert.equal(normalized.compatibility.uniswap.status, "blocked");
  assert.match(normalized.blockingIssues.join("\n"), /initialSupply must be a non-negative integer/);
  assert.match(normalized.blockingIssues.join("\n"), /decimals must be an integer between 0 and 255/);
});

test("normalizeRequest blocks float-valued numeric fields", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-request-"));
  const requestPath = path.join(tempDir, "request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "Float Token",
      symbol: "FLOAT",
      chainId: 31337,
      chainName: "anvil",
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: 1000.9,
      decimals: 18.1,
      mintable: false,
    }),
  );

  const normalized = normalizeRequest(requestPath);
  assert.equal(normalized.initialSupply, null);
  assert.equal(normalized.decimals, 18);
  assert.equal(normalized.compatibility.ajna.status, "blocked");
  assert.equal(normalized.compatibility.uniswap.status, "blocked");
  assert.match(normalized.blockingIssues.join("\n"), /initialSupply must be a non-negative integer/);
  assert.match(normalized.blockingIssues.join("\n"), /decimals must be an integer between 0 and 255/);
});

test("normalizeRequest blocks malformed chainId values before scaffold or deploy", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-request-"));
  const requestPath = path.join(tempDir, "request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "Bad Chain Id",
      symbol: "BADCID",
      chainId: true,
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: "1000",
      decimals: 18,
      mintable: false,
    }),
  );

  const normalized = normalizeRequest(requestPath);
  assert.equal(normalized.chainId, null);
  assert.equal(normalized.compatibility.ajna.status, "blocked");
  assert.equal(normalized.compatibility.uniswap.status, "blocked");
  assert.match(normalized.blockingIssues.join("\n"), /chainId must be a non-negative integer/);
});

test("normalizeRequest blocks malformed chainName values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-request-"));
  const requestPath = path.join(tempDir, "request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "Bad Chain Name",
      symbol: "BADCN",
      chainId: 31337,
      chainName: true,
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: "1000",
      decimals: 18,
      mintable: false,
    }),
  );

  const normalized = normalizeRequest(requestPath);
  assert.equal(normalized.chainName, null);
  assert.equal(normalized.compatibility.ajna.status, "blocked");
  assert.equal(normalized.compatibility.uniswap.status, "blocked");
  assert.match(normalized.blockingIssues.join("\n"), /chainName must be a non-empty string/);
});

test("normalizeRequest blocks malformed boolean feature flags", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-request-"));
  const requestPath = path.join(tempDir, "request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "Bad Bool Flags",
      symbol: "BBF",
      chainId: 31337,
      chainName: "anvil",
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: "1000",
      decimals: 18,
      mintable: 2,
      feeOnTransfer: 1,
    }),
  );

  const normalized = normalizeRequest(requestPath);
  assert.equal(normalized.features.mintable, false);
  assert.equal(normalized.features.feeOnTransfer, false);
  assert.equal(normalized.compatibility.ajna.status, "blocked");
  assert.equal(normalized.compatibility.uniswap.status, "blocked");
  assert.match(normalized.blockingIssues.join("\n"), /mintable must be a boolean/);
  assert.match(normalized.blockingIssues.join("\n"), /feeOnTransfer must be a boolean/);
});

test("deployRequest preserves a manifest when verification fails after broadcast", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-deployer-forge-"));
  const fakeBinDir = path.join(tempDir, "bin");
  const fakeForgePath = path.join(fakeBinDir, "forge");
  const requestPath = path.join(tempDir, "request.json");
  const workspaceDir = path.join(tempDir, "workspace");

  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.writeFileSync(
    fakeForgePath,
    `#!/usr/bin/env bash
set -euo pipefail
cmd="\${1:-}"
shift || true
case "$cmd" in
  build|test)
    exit 0
    ;;
  script)
    mkdir -p "$PWD/broadcast/DeployDefiCompatibleERC20.s.sol/31337"
    cat > "$PWD/broadcast/DeployDefiCompatibleERC20.s.sol/31337/run-latest.json" <<'EOF'
{
  "chain": 31337,
  "transactions": [
    {
      "hash": "0xabc",
      "transactionType": "CREATE",
      "contractAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      "transaction": {
        "from": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        "chainId": "0x7a69"
      }
    }
  ],
  "receipts": [
    {
      "from": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      "contractAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
    }
  ]
}
EOF
    printf 'verification failed\\n' >&2
    exit 1
    ;;
  *)
    printf 'unexpected forge command: %s\\n' "$cmd" >&2
    exit 1
    ;;
esac
`,
  );
  fs.chmodSync(fakeForgePath, 0o755);
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      standard: "erc20",
      name: "Verify Token",
      symbol: "VERIFY",
      chainId: 31337,
      chainName: "anvil",
      owner: "0x1111111111111111111111111111111111111111",
      initialRecipient: "0x2222222222222222222222222222222222222222",
      initialSupply: "1000",
      decimals: 18,
      mintable: false,
    }),
  );

  const previousPath = process.env.PATH;
  const previousFetch = globalThis.fetch;
  process.env.PATH = `${fakeBinDir}:${previousPath ?? ""}`;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { jsonrpc: "2.0", id: 1, result: "0x7a69" };
    },
  });

  try {
    await assert.rejects(
      () =>
        deployRequest(requestPath, {
          "target-dir": workspaceDir,
          force: true,
          broadcast: true,
          verify: true,
          "rpc-url": "http://rpc.example",
          "private-key": "0x1234",
        }),
      (error) => {
        assert.match(error.message, /manifest preserved/);
        assert.equal(error.details.verification.status, "failed-after-broadcast");
        return true;
      },
    );

    const manifestPath = path.join(workspaceDir, "deployments", "anvil", "verify-token.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.status, "deployed");
    assert.equal(manifest.deployedAddress, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    assert.equal(manifest.verification.status, "failed-after-broadcast");
    assert.match(manifest.verification.error, /verification failed/);
    assert.match(
      manifest.warnings.join("\n"),
      /broadcast succeeded but verification failed; manifest was preserved for recovery/,
    );
  } finally {
    process.env.PATH = previousPath;
    globalThis.fetch = previousFetch;
  }
});
