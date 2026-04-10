# Hermes Runtime Guide

This skill is designed for repo-installable use by Hermes and other
AgentSkills-compatible runtimes.

## Operating model

- Normalize the request into JSON first.
- Prefer the repo CLI when available:

```bash
./bin/token-deployer deploy request.json --broadcast --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

- Use the deployment manifest as the mint source of truth:

```bash
./bin/token-deployer mint deployments/base/acme-token.json --to 0x... --amount 1000 --broadcast --rpc-url "$RPC_URL" --private-key "$OWNER_PRIVATE_KEY"
```

- Build a repo-local deployment package. Do not deploy from ad hoc snippets.
- Build and test before any broadcast.
- Dry-run the deploy script once without `--broadcast` when constructor args,
  chain selection, or env wiring changed.
- Deploy only with explicit env and operator intent.
- Verify and smoke test after deployment.
- Return one structured summary instead of a paragraph-only handoff.

## Minimum request fields

- `standard`
- `name`
- `symbol`
- `chainId` or `chainName`
- `owner`
- ERC20: `initialRecipient` and `initialSupply`
- ERC721: `baseURI` if metadata should resolve immediately

## Expected handoff shape

Return JSON with at least these keys:

```json
{
  "standard": "erc20",
  "chainId": 8453,
  "chainName": "base",
  "contractName": "AcmeToken",
  "deployedAddress": "0x...",
  "deployer": "0x...",
  "owner": "0x...",
  "txHash": "0x...",
  "constructorArgs": {
    "name": "Acme Token",
    "symbol": "ACME"
  },
  "verification": {
    "status": "verified",
    "explorer": "basescan"
  },
  "manifestPath": "deployments/base/acme-token.json",
  "warnings": []
}
```

## CLI surface

- `./bin/token-deployer normalize request.json`
- `./bin/token-deployer scaffold request.json --target-dir /tmp/acme-token`
- `./bin/token-deployer deploy request.json`
- `./bin/token-deployer deploy request.json --broadcast --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --verify`
- `./bin/token-deployer mint deployments/base/acme-token.json --to 0x... --amount 1000 --rpc-url "$RPC_URL"`
- `./bin/token-deployer mint deployments/base/acme-token.json --to 0x... --amount 1000 --broadcast --rpc-url "$RPC_URL" --private-key "$OWNER_PRIVATE_KEY"`

## Failure contract

- Stop on any blocking compatibility issue from
  `references/compatibility-checklist.md`.
- Stop if `forge build` or `forge test` fails.
- Stop if explorer verification fails and the operator asked for verified source.
- Stop if the requested `chainId` or `chainName` disagrees with the selected RPC.
- Stop if the operator supplies `chainName` for a broadcast chain whose canonical
  name is unknown to the tool; use `chainId` only or extend the chain map first.
- Stop if a mint request is broadcast by any signer other than the current
  onchain owner.
- Stop if an ERC20 mint is requested for a deployment that was not created with
  minting enabled.
- Stop if smoke checks return different config than the requested config.

## Handoff rules

- Keep warnings explicit. Do not hide minting power, non-18 decimals, or proxy
  use in prose.
- Include the exact deploy command that was run.
- Include the exact verification command if verification was manual.
- Include the manifest path so later agents can resume from a clean state.
