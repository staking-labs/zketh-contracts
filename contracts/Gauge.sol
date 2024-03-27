// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./StakelessPoolBase.sol";
import "./interfaces/IGauge.sol";

/// @title Stakeless pool for vaults
/// @author belbix
/// @author a17
contract Gauge is StakelessPoolBase {
    // *************************************************************
    //                        VARIABLES
    // *************************************************************

    address public stakingToken;

    // *************************************************************
    //                        EVENTS
    // *************************************************************

    event StakingToken(address token);
    event Deposit(address indexed account, uint amount);
    event Withdraw(address indexed account, uint amount, bool full, uint veId);

    // *************************************************************
    //                        INIT
    // *************************************************************

    constructor(
        address defaultRewardToken_,
        uint duration_,
        address governance_
    ) StakelessPoolBase(defaultRewardToken_, duration_, governance_) {}

    function setStakingToken(address stakingToken_) external {
        require (stakingToken == address(0), "Already");
        stakingToken = stakingToken_;
        emit StakingToken(stakingToken_);
    }

    // *************************************************************
    //                        CLAIMS
    // *************************************************************

    function getReward(address account, address[] memory tokens) external {
        _getReward(account, tokens);
    }

    function getAllRewards(address account) external {
        _getAllRewards(account);
    }

    function _getAllRewards(address account) internal {
        address[] storage rts = rewardTokens;
        uint length = rts.length;
        address[] memory tokens = new address[](length + 1);
        for (uint i; i < length; ++i) {
            tokens[i] = rts[i];
        }
        tokens[length] = defaultRewardToken;
        _getReward(account, tokens);
    }

    function _getReward(address account, address[] memory tokens) internal {
        _getReward(account, tokens, account);
    }

    // *************************************************************
    //                   VIRTUAL DEPOSIT/WITHDRAW
    // *************************************************************

    /// @dev Must be called from stakingToken when user balance changed.
    function handleBalanceChange(address account) external {
        address _stakingToken = msg.sender;
        require(stakingToken == _stakingToken, "Wrong staking token");

        uint stakedBalance = balanceOf[account];
        uint actualBalance = IERC20(_stakingToken).balanceOf(account);
        if (stakedBalance < actualBalance) {
            _deposit(account, actualBalance - stakedBalance);
        } else if (stakedBalance > actualBalance) {
            _withdraw(account, stakedBalance - actualBalance, actualBalance == 0);
        }
    }

    function _deposit(
        address account,
        uint amount
    ) internal {
        _registerBalanceIncreasing(account, amount);
        emit Deposit(account, amount);
    }

    function _withdraw(
        address account,
        uint amount,
        bool fullWithdraw
    ) internal {
        _registerBalanceDecreasing(account, amount);
        emit Withdraw(
            account,
            amount,
            fullWithdraw,
            0
        );
    }

    // *************************************************************
    //                   REWARDS DISTRIBUTION
    // *************************************************************

    function notifyRewardAmount(address token, uint amount) external nonReentrant {
        _notifyRewardAmount(token, amount, true);
    }

}
