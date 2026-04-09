// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ScriptBase} from "./ScriptBase.sol";
import {DefiCompatibleERC20} from "../src/DefiCompatibleERC20.sol";

contract DeployDefiCompatibleERC20 is ScriptBase {
    function run() external returns (DefiCompatibleERC20 token) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        string memory name = vm.envString("ERC20_NAME");
        string memory symbol = vm.envString("ERC20_SYMBOL");
        uint8 decimals = uint8(vm.envOr("ERC20_DECIMALS", uint256(18)));
        address initialOwner = vm.envAddress("INITIAL_OWNER");
        address initialRecipient = vm.envAddress("INITIAL_RECIPIENT");
        uint256 initialSupply = vm.envUint("INITIAL_SUPPLY");
        bool mintingEnabled = vm.envOr("ERC20_MINTING_ENABLED", false);

        vm.startBroadcast(privateKey);
        token = new DefiCompatibleERC20(
            name,
            symbol,
            decimals,
            initialOwner,
            initialRecipient,
            initialSupply,
            mintingEnabled
        );
        vm.stopBroadcast();
    }
}
