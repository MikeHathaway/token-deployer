import test from "node:test";
import assert from "node:assert/strict";

import { buildDeployCommand, buildEnvTemplate } from "../scripts/token-deployer.mjs";

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
