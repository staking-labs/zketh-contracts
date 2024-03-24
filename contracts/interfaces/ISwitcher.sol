// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISwitcher {
    event NewStrategy(address strategy);
    event AnnouncedNewStrategy(address strategy);
    event CancelAnnouncedStrategy(address strategy);
    event PendingStrategy(address strategy);
    event Invested(address indexed strategy, uint amount);
    event WithdrawFromStrategy(address indexed strategy, uint amount);

    error OnlyVaultCanDoThis();
    error OnlyGovernanceCanDoThis();
    error Already();
    error NoNewStrategyAnnounced();
    error Timelock();
    error NotPending();
    error AssetsHaveNotYetBeenBridged();
    error StrategyIsNowSwitching();
    error StrategyIsNotSwitchingNow();

    /// @notice Underlying asset
    function asset() external view returns (address);

    /// @notice Linked vault
    function vault() external view returns (address);

    /// @notice Current active strategy
    function strategy() external view returns (address);

    /// @notice New strategy
    function pendingStrategy() external view returns (address);

    /// @notice Address that can manage strategies
    function governance() external view returns (address);

    /// @notice Total assets managed by Switcher
    function totalAssets() external view returns (uint);

//    function doHardWork() external;

    /// @notice Invest all available assets to strategy
    function investAll() external;

    /// @notice Withdraws all underlying assets to the vault
    function withdrawAllToVault() external;

    /// @notice Withdraws underlying assets to the vault
    function withdrawToVault(uint amount) external;

    /// @notice First time setup method called by vault
    function setup(address asset_) external;
}
