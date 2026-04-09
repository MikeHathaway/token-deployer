// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MinimalERC20} from "./lib/MinimalERC20.sol";
import {Ownable} from "./lib/Ownable.sol";

contract DefiCompatibleERC20 is MinimalERC20, Ownable {
    error MintingDisabled();
    error ZeroInitialRecipient();

    uint8 private immutable tokenDecimals;
    bool public immutable mintingEnabled;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialOwner_,
        address initialRecipient_,
        uint256 initialSupply_,
        bool mintingEnabled_
    ) MinimalERC20(name_, symbol_) Ownable(initialOwner_) {
        if (initialRecipient_ == address(0)) revert ZeroInitialRecipient();

        tokenDecimals = decimals_;
        mintingEnabled = mintingEnabled_;

        if (initialSupply_ > 0) {
            _mint(initialRecipient_, initialSupply_);
        }
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (!mintingEnabled) revert MintingDisabled();
        _mint(to, amount);
    }
}
