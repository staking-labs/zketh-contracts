// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Strategy for staking an asset on another network
interface IBridgingStrategy {
    /// @notice Underlying asset
    function asset() external view returns (address);

    /// @notice Linked switcher that manage strategy of the vault
    function switcher() external view returns (address);

    /// @notice Total amount of assets under strategy management
    function totalAssets() external view returns (uint);

    /// @notice Amount of assets under strategy management on another network
    function bridgedAssets() external view returns (uint);

    /// @notice Last time of HardWork execution on current network
    function lastHardWork() external view returns (uint);

    /// @notice Usually, indicate that claimable rewards have reasonable amount
    function isReadyToHardWork() external view returns (bool);

    /// @notice Total requested assets for withdraw from another network
    function totalRequested() external view returns (uint);

    /// @notice Withdraws all assets under strategy management to the Switcher
    /// @dev Will only be executed if all assets have already been transferred to the current network
    function withdrawAllToSwitcher() external returns(uint amount);

    /// @notice Withdraws assets to the Switcher
    function withdrawToSwitcher(uint amount) external;

    /// @notice Bridge assets for staking on another network
    function invest() external;

    /// @notice Claim cross-chain message with updated balance snapshot
    function doHardWork() external; /* returns (uint earned)*/

    function requestAssets(uint amount) external;

}
