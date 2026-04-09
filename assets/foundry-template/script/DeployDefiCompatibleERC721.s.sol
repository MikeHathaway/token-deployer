// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ScriptBase} from "./ScriptBase.sol";
import {DefiCompatibleERC721} from "../src/DefiCompatibleERC721.sol";

contract DeployDefiCompatibleERC721 is ScriptBase {
    function run() external returns (DefiCompatibleERC721 token) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        string memory name = vm.envString("ERC721_NAME");
        string memory symbol = vm.envString("ERC721_SYMBOL");
        address initialOwner = vm.envAddress("INITIAL_OWNER");
        string memory baseURI = vm.envOr("ERC721_BASE_URI", string(""));

        vm.startBroadcast(privateKey);
        token = new DefiCompatibleERC721(name, symbol, initialOwner, baseURI);
        vm.stopBroadcast();
    }
}
