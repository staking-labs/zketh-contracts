// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Strategy for staking an asset on another network
interface IBridgingStrategy {
    event Destination(address contractL1);
    event RequestAssets(address indexed owner, uint vaultSharesAmount);
    event BridgeAssetsToL1(uint amount);
    event BridgeRequestMessageToL1(uint amount);

    /// @notice Underlying asset
    function asset() external view returns (address);

    /// @notice Linked switcher that manage strategy of the vault
    function switcher() external view returns (address);

    /// @notice Strategy contract on another network
    function destination() external view returns (address);

    /// @notice Total amount of assets under strategy management
    function totalAssets() external view returns (uint);

    /// @notice Amount of assets under strategy management on another network
    function bridgedAssets() external view returns (uint);

    /// @notice Last time of HardWork execution on current network
    function lastHardWork() external view returns (uint);

    /// @notice Total requested assets for withdraw from another network
    function totalRequested() external view returns (uint);

    /// @notice Is ready to bridge assets to another network
    function canBridgeAssets() external view returns (bool can, uint amount);

    /// @notice Withdraws all assets under strategy management to the Switcher
    /// @dev Will only be executed if all assets have already been transferred to the current network
    function withdrawAllToSwitcher() external returns(uint amount);

    /// @notice Withdraws assets to the Switcher
    function withdrawToSwitcher(uint amount) external;

    /// @notice Bridge assets for staking on another network
    function bridgeAssets() external;

    /// @notice Claim cross-chain message with updated balance snapshot
//    function doHardWork() external; /* returns (uint earned)*/

    /// @notice Send message to another network for claiming all invested assets
    /// Only Switcher can call it.
    function requestClaimAllAssets() external;

    /// @notice Transfer vault shares from user and put claim request to shuttle
    /// Only vault shares owner can call it.
    function requestClaimAssets(uint vaultSharesAmount) external;

    /// @notice Claim requested and bridged from another network assets
    function claimRequestedAssets(address[] calldata sharesHolders) external;


}
