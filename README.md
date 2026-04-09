# DeFi Token Deployer

`defi-token-deployer` is a small repo-installable tool and agent skill for
rapidly deploying boring ERC20 and ERC721 contracts that are intended to stay
compatible with DeFi integrations like Ajna and Uniswap.

It ships two surfaces:

- a human and agent-friendly CLI at `./bin/token-deployer`
- an AgentSkills entrypoint at `SKILL.md`

The default path is Foundry-first and tool-agnostic. If another runtime wants
to call one command with JSON in and JSON out, the CLI is the stable interface.

## What it does

- normalizes token deployment requests
- rejects obviously incompatible token features like fee-on-transfer or
  soulbound behavior
- scaffolds a self-contained Foundry workspace
- runs `forge build` and `forge test`
- simulates or broadcasts the deployment script
- writes a machine-readable deployment manifest

## Requirements

- `node`
- `python` or `python3`
- `forge`

## Quick Start

Normalize a request:

```bash
./bin/token-deployer normalize request.json
```

Scaffold a Foundry workspace:

```bash
./bin/token-deployer scaffold request.json --target-dir /tmp/my-token --force
```

Run the full dry-run path:

```bash
./bin/token-deployer deploy request.json
```

Broadcast a real deployment:

```bash
./bin/token-deployer deploy request.json \
  --broadcast \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

Request explorer verification through Foundry:

```bash
./bin/token-deployer deploy request.json \
  --broadcast \
  --verify \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

## Example Requests

ERC20:

```json
{
  "standard": "erc20",
  "name": "Rapid Token",
  "symbol": "RAPID",
  "chainId": 8453,
  "chainName": "base",
  "owner": "0x1111111111111111111111111111111111111111",
  "initialRecipient": "0x2222222222222222222222222222222222222222",
  "initialSupply": "1000000000000000000000000",
  "decimals": 18,
  "mintable": false
}
```

ERC721:

```json
{
  "standard": "erc721",
  "name": "Rapid Collectible",
  "symbol": "RCNFT",
  "chainId": 8453,
  "chainName": "base",
  "owner": "0x1111111111111111111111111111111111111111",
  "baseURI": "ipfs://collection/"
}
```

## Output Artifacts

The CLI creates a workspace containing:

- `token-deployer.request.json`
- `token-deployer.normalized.json`
- `.env.token-deployer`
- a Foundry project copied from `assets/foundry-template`
- `deployments/<chain>/<token>.json` after `deploy`

Dry-run deployments write a manifest with `status: "simulated"`.
Broadcast deployments write a manifest with `status: "deployed"`.

## Commands

### `normalize`

```bash
./bin/token-deployer normalize request.json [--out normalized.json]
```

Runs the Python request normalizer and prints normalized JSON.

### `scaffold`

```bash
./bin/token-deployer scaffold request.json [--target-dir <dir>] [--force]
```

Copies the bundled Foundry template into a target directory and writes the
normalized request artifacts.

### `deploy`

```bash
./bin/token-deployer deploy request.json [--target-dir <dir>] [--force] [--broadcast] [--verify] [--rpc-url <url>] [--private-key <hex>]
```

Runs the full flow:

1. normalize the request
2. scaffold the workspace
3. run `forge build`
4. run `forge test`
5. run the matching deploy script
6. write a deployment manifest

## Safety Model

- rejects fee-on-transfer, rebasing, blacklist, pause-in-transfer, and similar
  features for ERC20 requests that claim DeFi compatibility
- rejects soulbound and transfer-restricting ERC721 requests for Ajna-style NFT
  collateral use
- dry-run is the default
- real deployment requires `--broadcast`

## Repo Layout

- `bin/token-deployer`: CLI entrypoint
- `scripts/token-deployer.mjs`: main CLI implementation
- `scripts/normalize_token_config.py`: request normalization and compatibility
  checks
- `assets/foundry-template/`: self-contained Foundry contracts, tests, and
  scripts
- `SKILL.md`: AgentSkills entrypoint
- `references/`: compatibility and runtime notes

## Agent Use

Autonomous agents should prefer the CLI over reconstructing the deployment flow
from prose. The easiest stable entrypoint is:

```bash
./bin/token-deployer deploy request.json
```

If the runtime supports skills directly, use `SKILL.md` as the repo-native skill
surface.
