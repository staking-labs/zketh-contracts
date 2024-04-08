// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IGauge.sol";
import "./interfaces/IRewardToken.sol";

/// @title Gauge rewards filler
/// @dev Compatible with Gelato Solidity Functions service
/// @author a17
contract GaugeRewarder {

    address public immutable gauge;

    address public immutable rewardToken;

    uint public immutable duration;

    uint public immutable rewardAmountPerDuration;

    uint public lastExec;

    error WaitFor(uint timestamp);

    constructor(address gauge_, address rewardToken_, uint rewardAmountPerDuration_) {
        gauge = gauge_;
        rewardToken = rewardToken_;
        duration = IGauge(gauge_).duration();
        rewardAmountPerDuration = rewardAmountPerDuration_;
        IERC20(rewardToken_).approve(gauge_, type(uint).max);
    }

    function checker() public view returns (bool canExec, bytes memory execPayload) {
        canExec = (block.timestamp - lastExec) > duration && IRewardToken(rewardToken).minter() == address(this);
        execPayload = abi.encodeCall(GaugeRewarder.addRewards, ());
    }

    function addRewards() external {
        (bool canExec,) = checker();
        if (!canExec) {
            revert WaitFor(lastExec + duration);
        }

        uint _rewardAmountPerDuration = rewardAmountPerDuration;
        IRewardToken(rewardToken).mint(rewardAmountPerDuration);
        IGauge(gauge).notifyRewardAmount(rewardToken, _rewardAmountPerDuration);
        lastExec = block.timestamp;
    }
}
