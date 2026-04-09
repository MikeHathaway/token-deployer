// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {DefiCompatibleERC721} from "../src/DefiCompatibleERC721.sol";

contract DefiCompatibleERC721Test is TestBase {
    address internal owner = address(0xA11CE);
    address internal alice = address(0xB0B);
    address internal bob = address(0xCAFE);

    function test_owner_mints_sequential_ids() public {
        DefiCompatibleERC721 token =
            new DefiCompatibleERC721("Acme Collectible", "ACNFT", owner, "ipfs://collection/");

        vm.startPrank(owner);
        uint256 firstId = token.mint(alice);
        uint256 secondId = token.mint(alice);
        vm.stopPrank();

        assertEq(firstId, 1);
        assertEq(secondId, 2);
        assertEq(token.ownerOf(firstId), alice);
        assertEq(token.ownerOf(secondId), alice);
        assertEq(token.tokenURI(firstId), "ipfs://collection/1");
    }

    function test_transfers_work_with_standard_approval_flow() public {
        DefiCompatibleERC721 token =
            new DefiCompatibleERC721("Acme Collectible", "ACNFT", owner, "ipfs://collection/");

        vm.prank(owner);
        uint256 tokenId = token.mint(alice);

        vm.startPrank(alice);
        token.approve(bob, tokenId);
        vm.stopPrank();

        vm.prank(bob);
        token.transferFrom(alice, bob, tokenId);

        assertEq(token.ownerOf(tokenId), bob);
    }
}
