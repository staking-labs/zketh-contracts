// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IBridgingStrategy.sol";
import "../interfaces/ISwitcher.sol";

contract MockStrategy is IBridgingStrategy {
    /// @inheritdoc IBridgingStrategy
    address public asset;

    /// @inheritdoc IBridgingStrategy
    address public switcher;

    /// @inheritdoc IBridgingStrategy
    address public destination;

    /// @inheritdoc IBridgingStrategy
    uint public bridgedAssets;

    /// @inheritdoc IBridgingStrategy
    uint public totalRequested;

    bool internal _isReadyToHardWork;

    address internal _assetHolder;

    bool internal _lossOnWithdraw;

    error NotEnoughBridgedAssets();
    error NotAllAssetsAreBridged();

    constructor(address switcher_) {
        switcher = switcher_;
        asset = ISwitcher(switcher_).asset();
    }

    // mock methods

    function setIsReadyToHardWork(bool value) external {
        _isReadyToHardWork = value;
    }

    function setLossOnWithdraw(bool value) external {
        _lossOnWithdraw = value;
    }

    function setTotalRequested(uint value) external {
        totalRequested = value;
    }

    function setBridgedAssets(uint value) external {
        bridgedAssets = value;
    }

    function lossMoney() external {
        uint b = IERC20(asset).balanceOf(address (this));
        IERC20(asset).transfer(address(1), b / 10);
    }

    function pendingRequestedBridgingAssets() external view returns (uint) {}

    /// @inheritdoc IBridgingStrategy
    function callBridge() external {}

    /// @inheritdoc IBridgingStrategy
    function needBridgingNow() public view returns (bool need, bool toL1, uint amount) {}

    function isReadyToHardWork() external view returns (bool) {
        return _isReadyToHardWork;
    }

    /// @inheritdoc IBridgingStrategy
    function totalAssets() external view returns (uint) {
        return IERC20(asset).balanceOf(address (this)) + bridgedAssets;
    }

    /// @inheritdoc IBridgingStrategy
    function withdrawAllToSwitcher() external returns(uint amount) {
        if (bridgedAssets > 0) {
            revert NotAllAssetsAreBridged();
        }
        amount = IERC20(asset).balanceOf(address (this));
        IERC20(asset).transfer(switcher, amount);
    }

    /// @inheritdoc IBridgingStrategy
    function withdrawToSwitcher(uint amount) external {
        uint withdrawAmount = amount;
        if (_lossOnWithdraw) {
            withdrawAmount -= amount / 100;
            IERC20(asset).transfer(address(1), amount / 100);
        }
        IERC20(asset).transfer(switcher, withdrawAmount);
    }

    /// @inheritdoc IBridgingStrategy
    function requestClaimAllAssets() external {}

    /// @inheritdoc IBridgingStrategy
    function requestClaimAssets(uint vaultSharesAmount) external {
        // vault share price is 1.0
        totalRequested += vaultSharesAmount;
    }

    /// @inheritdoc IBridgingStrategy
    function claimRequestedAssets(address[] calldata sharesHolders) external {}
}
