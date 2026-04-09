# Foundry Template

The bundled template lives at `assets/foundry-template`.

## Files

- `foundry.toml`
- `src/DefiCompatibleERC20.sol`
- `src/DefiCompatibleERC721.sol`
- `script/DeployDefiCompatibleERC20.s.sol`
- `script/DeployDefiCompatibleERC721.s.sol`
- `test/DefiCompatibleERC20.t.sol`
- `test/DefiCompatibleERC721.t.sol`

## Install into a target repo

```bash
cp -R assets/foundry-template/. /path/to/target-repo/
cd /path/to/target-repo
forge build
forge test
```

## ERC20 env vars

- `PRIVATE_KEY`
- `ERC20_NAME`
- `ERC20_SYMBOL`
- `ERC20_DECIMALS`
- `INITIAL_OWNER`
- `INITIAL_RECIPIENT`
- `INITIAL_SUPPLY`
- `ERC20_MINTING_ENABLED`

## ERC721 env vars

- `PRIVATE_KEY`
- `ERC721_NAME`
- `ERC721_SYMBOL`
- `INITIAL_OWNER`
- `ERC721_BASE_URI`

## Broadcast commands

```bash
forge script script/DeployDefiCompatibleERC20.s.sol:DeployDefiCompatibleERC20 --rpc-url "$RPC_URL" --broadcast
forge script script/DeployDefiCompatibleERC721.s.sol:DeployDefiCompatibleERC721 --rpc-url "$RPC_URL" --broadcast
```

Add `--verify` when explorer credentials are configured.

## What the template intentionally does not include

- fee-on-transfer logic
- rebasing
- blacklists
- pausable transfer paths
- proxies
- upgrade admin plumbing
- auto-liquidity or router coupling

Those features are where "DeFi-compatible token" projects usually go off the
rails.
