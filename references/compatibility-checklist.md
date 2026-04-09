# Compatibility Checklist

Use this checklist when the request includes `Ajna`, `Uniswap`, `DEX`,
`lending`, `collateral`, or `DeFi-compatible`.

## ERC20 safe defaults

- Implement standard `transfer`, `transferFrom`, `approve`, `allowance`,
  `balanceOf`, and `totalSupply`.
- Return `bool` on state-changing token methods.
- Keep balances fixed. No rebasing. No share-accounting wrapper behavior.
- Preserve exact transfer amounts. If the caller sends `1e18`, the receiver
  should receive `1e18`.
- Keep approval semantics boring. Infinite approvals should stay infinite until
  the holder changes them.
- Default to 18 decimals.
- Constructor minting or owner minting can be acceptable, but call out supply
  control in the handoff manifest.

## ERC20 blockers for Ajna or Uniswap

- Fee-on-transfer, reflection, or transfer tax.
- Rebasing or elastic supply.
- Transfer-path pause or blacklist.
- ERC777-style hooks or other automatic external calls during transfer.
- Auto-liquidity, auto-swap, or tax routing inside transfer.
- Admin seizure or forced-transfer logic in normal user balances.
- Non-standard return values or approval semantics.

## ERC20 warnings

- Non-18 decimals can work, but integrations and operators make more mistakes.
- Owner minting changes supply assumptions. Call it out.
- Upgradeable proxies add operational risk. Use only when explicitly required.
- Permit is optional. Add it only when the downstream flow benefits from it.

## ERC721 safe defaults for Ajna and standard NFT tooling

- Implement standard ERC721 approvals and transfers.
- Keep tokens transferable. Liquidators, marketplaces, and operators must be
  able to move approved tokens.
- Keep ownership semantics stable and token IDs predictable.
- Keep metadata behavior boring. `tokenURI` should not fail for valid token
  IDs.

## ERC721 blockers

- Soulbound behavior.
- Transfer blacklists or allowlists.
- Royalties or hooks that can revert safe transfers.
- Admin clawbacks that can invalidate collateral assumptions.
- Token ID reuse.

## Uniswap note

- Uniswap pair assets are ERC20s.
- An arbitrary ERC721 collection is not "Uniswap-compatible" in the same sense.
- If the user says "ERC721 for Uniswap", clarify whether they actually mean NFT
  metadata compatibility, liquidity-manager NFTs, or ERC20 paired liquidity
  around a separate token.

## Ajna note

- Ajna ERC20 pools want boring ERC20s.
- Ajna ERC721 pools want transferable standard NFTs with normal approval
  semantics.
- If the asset will be used as collateral, avoid admin behaviors that can freeze
  or devalue user positions unexpectedly.

## Deployment hygiene

- Prefer non-upgradeable contracts.
- Verify source on the block explorer.
- Record constructor args and owner addresses.
- Smoke test transfers or mint plus transfer before handoff.
