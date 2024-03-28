// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IRewardToken.sol";

/// @title Token for rewarding via gauge
contract RewardToken is ERC20, IRewardToken {
    address public immutable governance;

    address public minter;

    bool public finished;

    constructor(string memory name_, string memory symbol_, address governance_) ERC20(name_, symbol_) {
        governance = governance_;
    }

    function setMinter(address minter_) external {
        require(msg.sender == governance && !finished);
        minter = minter_;
    }

    function setFinished() external {
        require(msg.sender == governance);
        finished = true;
    }

    function mint(uint amount) external {
        require(msg.sender == minter && !finished);
        _mint(msg.sender, amount);
    }

}
