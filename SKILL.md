---
name: defi-token-deployer
description: Deploy DeFi-compatible ERC20 and ERC721 tokens on EVM chains with a Foundry-first workflow and tool-agnostic fallback. Use when Hermes or another autonomous agent needs to scaffold contracts, deployment scripts, tests, manifests, and verification steps for vanilla tokens intended to work with Ajna ERC20/ERC721 pools, Uniswap pairs, or other protocols that expect standard token behavior.
---

# DeFi Token Deployer

Use this skill to ship boring ERC20 and ERC721 contracts that downstream
protocols will actually tolerate.

Prefer the repo CLI when it is available. The fastest path for most autonomous
agents is:

```bash
./bin/token-deployer deploy request.json --broadcast --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

Or dry-run the full scaffold, build, test, and script path without broadcasting:

```bash
./bin/token-deployer deploy request.json
```

If you need deeper context, read:

- `references/compatibility-checklist.md`
- `references/hermes-runtime.md`
- `references/foundry-template.md`

## Default policy

- Prefer Foundry unless the target repo already has a working deployment stack.
- Prefer non-upgradeable contracts unless the user explicitly asks for
  upgradeability.
- Prefer vanilla ERC20 behavior: no fee-on-transfer, no rebasing, no blacklist,
  no pause in the transfer path, no transfer tax, no auto-liquidity logic, and
  no hooks that surprise routers or lending pools.
- The bundled CLI currently blocks `permit: true` requests until a dedicated
  ERC20Permit variant exists.
- Prefer transferable ERC721 behavior: no soulbound restrictions, no transfer
  blacklists, and no transfer-time hooks that can block pool liquidations or
  marketplace transfers.
- Prefer 18 decimals for ERC20 unless a protocol or migration requirement says
  otherwise.
- Preserve the existing repo toolchain when a target project already uses
  Hardhat or another stack, but keep the same safety checks and smoke tests.
- If the request says "compatible with Uniswap" for an ERC721, stop and clarify
  the goal. Arbitrary ERC721 collections are not Uniswap pair assets the way
  ERC20s are.

## Workflow

1. Normalize the request.
Prefer:

```bash
./bin/token-deployer normalize request.json
```

Or run `python scripts/normalize_token_config.py <request.json> --out <normalized.json>`
before writing contracts. Stop on any blocking compatibility issue.

2. Pick the narrowest contract.
Use the template in `assets/foundry-template` as the default starting point.
Remove powers the user does not need. The safe default is fewer admin
capabilities, not more.

3. Scaffold the deployment package.
For Foundry work, either call the CLI or copy the template into the target repo
and keep contracts, deploy scripts, tests, and deployment manifests together.

4. Build and test before broadcast.
At minimum run `forge build` and `forge test`. If the token changes an existing
repo, run the repo's own test suite too.

5. Broadcast with explicit env.
Use env vars for RPC URL, private key, owner, recipients, supply, and URIs.
Never hardcode deployer secrets or chain endpoints in source files.

6. Verify and smoke check.
After deployment, verify the contract on the explorer, then read back name,
symbol, owner, decimals or base URI, supply or token ID flow, and one transfer
or mint path.

7. Hand off machine-readable output.
Return a deployment summary that includes token standard, chain id, deployer,
deployed address, tx hash, constructor args, verification status, manifest
path, and any compatibility warnings that remain.

## Foundry-first path

1. Copy `assets/foundry-template` into the working repo.
2. Run:

```bash
forge build
forge test
```

3. Broadcast with the matching script:

```bash
forge script script/DeployDefiCompatibleERC20.s.sol:DeployDefiCompatibleERC20 --rpc-url "$RPC_URL" --broadcast
forge script script/DeployDefiCompatibleERC721.s.sol:DeployDefiCompatibleERC721 --rpc-url "$RPC_URL" --broadcast
```

4. If explorer credentials are configured, add `--verify`.

## Tool-agnostic fallback

- If the target repo already has a stable deployment stack, keep that stack.
- Reuse the same contract constraints from
  `references/compatibility-checklist.md`.
- Recreate the same smoke checks the Foundry tests cover.
- Still emit the same machine-readable deployment manifest for Hermes.

## Stop conditions

- Stop if the request depends on fee-on-transfer, rebasing, blacklist, transfer
  pause, soulbound behavior, or other non-standard transfer semantics and the
  user still expects Ajna or Uniswap compatibility.
- Stop if the chain, owner, supply, recipient, base URI, or verification target
  is missing.
- Stop if a broadcast request includes `chainName` for a chain id that the tool
  cannot map canonically yet. For unknown chains, prefer explicit `chainId` and
  let the manifest use the numeric chain slug.
- Stop if build or tests fail.
- Stop if deployment succeeds but verification or smoke checks disagree with
  the intended config.

## Verification checklist

- ERC20: `name`, `symbol`, `decimals`, `totalSupply`,
  `balanceOf(initialRecipient)`, optional `owner`, and one transfer.
- ERC721: `name`, `symbol`, `owner`, `balanceOf`, `ownerOf(mintedTokenId)`,
  `tokenURI` or base URI behavior, and one safe transfer.
- Record the deployed address, chain id, tx hash, constructor args, and
  verification result in the handoff manifest.

## References

- `references/compatibility-checklist.md` for protocol compatibility rules and
  blockers.
- `references/hermes-runtime.md` for the autonomous-agent operating model and
  expected handoff shape.
- `references/foundry-template.md` for the bundled template layout, env vars,
  and commands.
