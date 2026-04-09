// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MinimalERC721} from "./lib/MinimalERC721.sol";
import {Ownable} from "./lib/Ownable.sol";

contract DefiCompatibleERC721 is MinimalERC721, Ownable {
    uint256 public nextTokenId;
    string private baseTokenURI;

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner_,
        string memory baseTokenURI_
    ) MinimalERC721(name_, symbol_) Ownable(initialOwner_) {
        baseTokenURI = baseTokenURI_;
    }

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
    }

    function setBaseURI(string memory baseTokenURI_) external onlyOwner {
        baseTokenURI = baseTokenURI_;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }
}
