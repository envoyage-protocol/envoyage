// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @notice A freely mintable ERC-20 for the Sepolia demo pool. Not part of the
///         Envoyage protocol — it exists so anyone can reproduce the demo without
///         hunting for testnet liquidity.
contract DemoToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_, 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
