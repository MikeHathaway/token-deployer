// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {DefiCompatibleERC20} from "../src/DefiCompatibleERC20.sol";

contract DefiCompatibleERC20Test is TestBase {
    address internal owner = address(0xA11CE);
    address internal recipient = address(0xB0B);
    address internal other = address(0xCAFE);

    function test_initial_mint_and_decimals() public {
        DefiCompatibleERC20 token =
            new DefiCompatibleERC20("Acme Token", "ACME", 18, owner, recipient, 1_000 ether, false);

        assertEq(token.name(), "Acme Token");
        assertEq(token.symbol(), "ACME");
        assertEq(uint256(token.decimals()), uint256(18));
        assertEq(token.totalSupply(), 1_000 ether);
        assertEq(token.balanceOf(recipient), 1_000 ether);
    }

    function test_owner_can_mint_when_enabled() public {
        DefiCompatibleERC20 token =
            new DefiCompatibleERC20("Mintable Token", "MINT", 6, owner, recipient, 0, true);

        vm.prank(owner);
        token.mint(other, 25_000_000);

        assertEq(token.balanceOf(other), uint256(25_000_000));
        assertEq(token.totalSupply(), uint256(25_000_000));
    }

    function test_mint_reverts_when_disabled() public {
        DefiCompatibleERC20 token =
            new DefiCompatibleERC20("Fixed Token", "FIX", 18, owner, recipient, 1 ether, false);

        vm.prank(owner);
        vm.expectRevert(DefiCompatibleERC20.MintingDisabled.selector);
        token.mint(other, 1 ether);
    }

    function test_transfer_from_keeps_max_allowance() public {
        DefiCompatibleERC20 token =
            new DefiCompatibleERC20("Acme Token", "ACME", 18, owner, recipient, 10 ether, false);

        vm.prank(recipient);
        token.approve(other, type(uint256).max);

        vm.prank(other);
        token.transferFrom(recipient, other, 1 ether);

        assertEq(token.allowance(recipient, other), type(uint256).max);
        assertEq(token.balanceOf(other), 1 ether);
    }
}
