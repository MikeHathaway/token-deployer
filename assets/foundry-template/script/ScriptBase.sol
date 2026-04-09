// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function envUint(string calldata name) external returns (uint256 value);
    function envString(string calldata name) external returns (string memory value);
    function envAddress(string calldata name) external returns (address value);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256 value);
    function envOr(string calldata name, bool defaultValue) external returns (bool value);
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract ScriptBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
}
