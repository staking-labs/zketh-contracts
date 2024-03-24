// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ISwitcher.sol";
import "./interfaces/IBridgingStrategy.sol";

/// @title Switches strategy of the vault
/// @author a17
contract Switcher is ISwitcher {
    using SafeERC20 for IERC20;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         CONSTANTS                          */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    uint public constant TIME_LOCK = 86400;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                          STORAGE                           */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc ISwitcher
    address public asset;

    /// @inheritdoc ISwitcher
    address public vault;

    /// @inheritdoc ISwitcher
    address public immutable governance;

    /// @inheritdoc ISwitcher
    address public strategy;

    address public pendingStrategy;

    address public announcedPendingStrategy;

    uint public announceTime;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      INITIALIZATION                        */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    constructor(address governance_) {
        governance = governance_;
    }

    /// @inheritdoc ISwitcher
    function setup(address asset_) external {
        if (vault == address(0)) {
            asset = asset_;
            vault = msg.sender;
        }
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                          MODIFIERS                         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    modifier onlyVault() {
        _requireVault();
        _;
    }

    modifier onlyGovernance() {
        _requireGovernance();
        _;
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      RESTRICTED ACTIONS                    */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc ISwitcher
    function investAll() external onlyVault {
        _checkSwitching();
        address _strategy = strategy;
        address _asset = asset;
        if (_strategy != address(0)) {
            uint balance = IERC20(_asset).balanceOf(address(this));
            IERC20(_asset).safeTransfer(_strategy, balance);
            emit Invested(_strategy, balance);
        }
    }

    /// @inheritdoc ISwitcher
    function withdrawAllToVault() external onlyVault {
        _checkSwitching();
        address _vault = vault;
        address _strategy = strategy;
        address _asset = asset;
        if (_strategy != address(0)) {
            uint strategyBalance = IBridgingStrategy(_strategy).totalAssets();
            if (strategyBalance != 0) {
                uint withdrawAmount = IBridgingStrategy(_strategy).withdrawAllToSwitcher();
                emit WithdrawFromStrategy(_strategy, withdrawAmount);
            }
        }

        uint balanceAfter = IERC20(_asset).balanceOf(address(this));
        if (balanceAfter > 0) {
            IERC20(_asset).safeTransfer(_vault, balanceAfter);
        }
    }

    /// @inheritdoc ISwitcher
    function withdrawToVault(uint amount) external onlyVault {
        _checkSwitching();
        address _asset = asset;
        address _vault = vault;

        uint balance = IERC20(_asset).balanceOf(address(this));
        if (balance < amount) {
            uint remainingAmount = amount - balance;
            address _strategy = strategy;

            uint strategyBalance = IBridgingStrategy(_strategy).totalAssets();

            if (strategyBalance != 0) {
                // withdraw from strategy
                uint withdrawAmount;
                if (strategyBalance <= remainingAmount) {
                    withdrawAmount = IBridgingStrategy(_strategy).withdrawAllToSwitcher();
                } else {
                    IBridgingStrategy(_strategy).withdrawToSwitcher(remainingAmount);
                    withdrawAmount = remainingAmount;
                }

                emit WithdrawFromStrategy(_strategy, withdrawAmount);

                uint currentBalance = IERC20(_asset).balanceOf(address(this));
                // assume that we can not decrease switcher balance during withdraw process
                uint withdrew = currentBalance - balance;
                balance = currentBalance;

                remainingAmount = withdrew < remainingAmount ? remainingAmount - withdrew : 0;
            }
        }

        if (balance != 0) {
            IERC20(_asset).safeTransfer(_vault, Math.min(amount, balance));
        }
    }

    function initStrategy(address strategy_) external onlyGovernance {
        if (strategy != address(0)) {
            revert Already();
        }
        strategy = strategy_;
        emit NewStrategy(strategy_);
    }

    function announceNewStrategy(address newStrategy_) external onlyGovernance {
        if (announcedPendingStrategy != address(0)) {
            revert Already();
        }
        announcedPendingStrategy = newStrategy_;
        announceTime = block.timestamp;
        emit AnnouncedNewStrategy(newStrategy_);
    }

    function cancelAnnouncedStrategy() external onlyGovernance {
        address _announcedPendingStrategy = announcedPendingStrategy;
        if (_announcedPendingStrategy != address(0)) {
            announcedPendingStrategy = address(0);
            emit CancelAnnouncedStrategy(_announcedPendingStrategy);
        }
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         USER ACTIONS                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    function startStrategySwitching() external {
        address _announcedPendingStrategy = announcedPendingStrategy;
        if (_announcedPendingStrategy == address(0)) {
            revert NoNewStrategyAnnounced();
        }
        if (block.timestamp < announceTime + TIME_LOCK) {
            revert Timelock();
        }
        pendingStrategy = _announcedPendingStrategy;
        announcedPendingStrategy = address(0);
        uint needRequest = IBridgingStrategy(strategy).bridgedAssets() - IBridgingStrategy(strategy).totalRequested();
        if (needRequest > 0) {
            IBridgingStrategy(strategy).requestClaimAllAssets();
        }
        emit PendingStrategy(_announcedPendingStrategy);
    }

    function finishStrategySwitching() external {
        address _pendingStrategy = pendingStrategy;
        if (_pendingStrategy == address(0)) {
            revert StrategyIsNotSwitchingNow();
        }
        if (
            IBridgingStrategy(strategy).bridgedAssets() > 0
            || IBridgingStrategy(strategy).pendingRequestedBridgingAssets() > 0
        ) {
            revert AssetsHaveNotYetBeenBridged();
        }

        IBridgingStrategy(strategy).withdrawAllToSwitcher();

        strategy = _pendingStrategy;
        pendingStrategy = address(0);
        emit NewStrategy(_pendingStrategy);
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      VIEW FUNCTIONS                        */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc ISwitcher
    function totalAssets() public view override returns (uint) {
        uint bal = IERC20(asset).balanceOf(address(this));
        address _strategy = strategy;
        return _strategy == address(0) ? bal : bal + IBridgingStrategy(_strategy).totalAssets();
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       INTERNAL LOGIC                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    function _requireVault() internal view {
        if (msg.sender != vault) {
            revert OnlyVaultCanDoThis();
        }
    }

    function _requireGovernance() internal view {
        if (msg.sender != governance) {
            revert OnlyGovernanceCanDoThis();
        }
    }

    function _checkSwitching() internal view {
        if (pendingStrategy != address(0)) {
            revert StrategyIsNowSwitching();
        }
    }
}
