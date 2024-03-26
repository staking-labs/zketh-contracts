// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGauge {
    function getReward(address account, address[] memory tokens) external;

    function getAllRewards(address account) external;

    function handleBalanceChange(address account) external;

    function notifyRewardAmount(address token, uint amount) external;

    function setStakingToken(address stakingToken_) external;
}