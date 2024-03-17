// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@0xpolygonhermez/zkevm-contracts/contracts/v2/interfaces/IPolygonZkEVMBridgeV2.sol";
import "./interfaces/ISwitcher.sol";
import "./interfaces/IBridgingStrategy.sol";
import "./interfaces/IWETH9.sol";

/// @title ETH bridged staking
/// @notice Bridging assets and messages between zkEVM and Ethereum via LxLy bridge
/// @author a17
contract BridgedStakingStrategy is IBridgingStrategy {
    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         CONSTANTS                          */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    uint public constant SHUTTLE_FORCE_BRIDGE = 10e18;

    uint public constant SHUTTLE_FORCE_CLAIM = 10e18;

    uint public constant MAX_WAIT_TIME_FOR_BRIDGING = 86400;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                          STORAGE                           */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc IBridgingStrategy
    address public immutable asset;

    /// @inheritdoc IBridgingStrategy
    address public immutable switcher;

    uint32 public destinationNetwork;

    /// @inheritdoc IBridgingStrategy
    address public destination;

    /// @dev LxLy bridge endpoint
    address public immutable bridge;

    /// @inheritdoc IBridgingStrategy
    uint public bridgedAssets;

    uint public pendingRequestedBridgingAssets;

    /// @inheritdoc IBridgingStrategy
    uint public lastHardWork;

    uint public lastBridgeTime;

    bool internal _isWethWithdrawing;

    mapping(address user => uint shares) public requests;

    uint public totalRequestedVaultSharesForClaim;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                          EVENTS                            */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    error DestinationIsNotSet();
    error Already();
    error NotEnoughBridgedAssets();
    error NotAllAssetsAreBridged();
    error CantBridge();
    error NoClaimRequestForUser(address user);
    error OnlySwitcherCanDoThis();
    error OnlyGovernanceCanDoThis();

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      INITIALIZATION                        */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    constructor(address switcher_, address bridge_, uint32 destinationNetwork_) {
        switcher = switcher_;
        bridge = bridge_;
        destinationNetwork = destinationNetwork_;
        asset = ISwitcher(switcher_).asset();
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                        CALLBACKS                           */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    receive() external payable {
        uint _pendingRequestedBridgingAssets = pendingRequestedBridgingAssets;
        if (!_isWethWithdrawing && _pendingRequestedBridgingAssets > 0) {
            IWETH9(asset).deposit{value: msg.value}();
            if (msg.value <= _pendingRequestedBridgingAssets) {
                pendingRequestedBridgingAssets = _pendingRequestedBridgingAssets - msg.value;
            } else {
                pendingRequestedBridgingAssets = 0;
            }
        }
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                        MODIFIERS                           */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    modifier onlySwitcher() {
        _requireSwitcher();
        _;
    }

    modifier onlyGovernance() {
        _requireGovernance();
        _;
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      RESTRICTED ACTIONS                    */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    function setDestination(address destination_) external onlyGovernance {
        if (destination != address(0)) {
            revert Already();
        }
        destination = destination_;
        emit Destination(destination_);
    }

    /// @inheritdoc IBridgingStrategy
    function requestClaimAllAssets() external onlySwitcher {
        // todo implement
    }

    /// @inheritdoc IBridgingStrategy
    function withdrawAllToSwitcher() external onlySwitcher returns(uint amount) {
        if (bridgedAssets > 0 || pendingRequestedBridgingAssets > 0) {
            revert NotAllAssetsAreBridged();
        }
        amount = IERC20(asset).balanceOf(address (this));
        IERC20(asset).transfer(switcher, amount);
    }

    /// @inheritdoc IBridgingStrategy
    function withdrawToSwitcher(uint amount) external onlySwitcher {
        uint withdrawAmount = amount;
        if (IERC20(asset).balanceOf(address(this)) < withdrawAmount) {
            revert NotEnoughBridgedAssets();
        }
        IERC20(asset).transfer(switcher, withdrawAmount);
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         USER ACTIONS                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc IBridgingStrategy
    function requestClaimAssets(uint vaultSharesAmount) external {
        IERC20(_getVault()).transferFrom(msg.sender, address(this), vaultSharesAmount);
        requests[msg.sender] += vaultSharesAmount;
        totalRequestedVaultSharesForClaim += vaultSharesAmount;

        // todo send cross-chain message if need

        emit RequestAssets(msg.sender, vaultSharesAmount);
    }

    /// @inheritdoc IBridgingStrategy
    function claimRequestedAssets(address[] calldata sharesHolders) external {
        uint len = sharesHolders.length;
        IERC4626 vault = IERC4626(_getVault());
        uint[] memory gotAssets = new uint[](len);
        uint totalSharesToBurn;
        for (uint i; i < len; ++i) {
            uint sharesToBurn = requests[sharesHolders[i]];
            if (sharesToBurn == 0) {
                revert NoClaimRequestForUser(sharesHolders[i]);
            }
            gotAssets[i] = vault.previewRedeem(sharesToBurn);
            totalSharesToBurn += sharesToBurn;
        }

        vault.redeem(totalSharesToBurn, address(this), address(this));

        for (uint i; i < len; ++i) {
            IERC20(asset).transfer(sharesHolders[i], gotAssets[i]);
        }
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       PUBLIC ACTIONS                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc IBridgingStrategy
    function bridgeAssets() external {
        if (destination == address(0)) {
            revert DestinationIsNotSet();
        }

        (bool can, uint amount) = canBridgeAssets();
        if (!can) {
            revert CantBridge();
        }

        _isWethWithdrawing = true;
        IWETH9(asset).withdraw(amount);
        _isWethWithdrawing = false;

        IPolygonZkEVMBridgeV2(bridge).bridgeAsset{value: amount}(
            destinationNetwork,
            destination,
            amount,
            address(0),
            true,
            bytes("0")
        );

        lastBridgeTime = block.timestamp;

        bridgedAssets += amount;

        emit BridgeAssetsToL1(amount);
    }

    function bridgeMessage() external {
        if (destination == address(0)) {
            revert DestinationIsNotSet();
        }

        (bool can, uint amount) = canBridgeClaimRequestMessage();
        if (!can) {
            revert CantBridge();
        }

        IPolygonZkEVMBridgeV2(bridge).bridgeMessage(
            destinationNetwork,
            destination,
            true,
            abi.encodePacked(amount)
        );

        lastBridgeTime = block.timestamp;

        bridgedAssets -= amount;

        pendingRequestedBridgingAssets += amount;

        emit BridgeRequestMessageToL1(amount);
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      VIEW FUNCTIONS                        */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc IBridgingStrategy
    function totalAssets() external view returns (uint) {
        return IERC20(asset).balanceOf(address (this)) + bridgedAssets + pendingRequestedBridgingAssets;
    }

    /// @inheritdoc IBridgingStrategy
    function totalRequested() public view returns (uint) {
        return IERC4626(_getVault()).convertToAssets(totalRequestedVaultSharesForClaim);
    }

    /// @inheritdoc IBridgingStrategy
    function canBridgeAssets() public view returns (bool can, uint amount) {
        // todo check shuttle, buffer
        uint bal = IERC20(asset).balanceOf(address(this));
        uint _totalRequested = totalRequested();
        if (bal > _totalRequested) {
            uint amountForBridging = bal - _totalRequested;
            if (
                amountForBridging >= SHUTTLE_FORCE_BRIDGE
                || block.timestamp - lastBridgeTime >= MAX_WAIT_TIME_FOR_BRIDGING
            ) {
                can = true;
                amount = amountForBridging;
            }
        }
    }

    function canBridgeClaimRequestMessage() public view returns (bool can, uint amount) {
        uint bal = IERC20(asset).balanceOf(address(this)) + pendingRequestedBridgingAssets;
        uint _totalRequested = totalRequested();

        if (bal < _totalRequested) {
            uint amountForBridging = _totalRequested - bal;
            if (
                amountForBridging >= SHUTTLE_FORCE_CLAIM
                || block.timestamp - lastBridgeTime >= MAX_WAIT_TIME_FOR_BRIDGING
            ) {
                can = true;
                amount = amountForBridging;
            }
        }
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       INTERNAL LOGIC                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    function _getVault() internal view returns (address) {
        return ISwitcher(switcher).vault();
    }

    function _requireSwitcher() internal view {
        if (msg.sender != switcher) {
            revert OnlySwitcherCanDoThis();
        }
    }

    function _requireGovernance() internal view {
        if (msg.sender != ISwitcher(switcher).governance()) {
            revert OnlyGovernanceCanDoThis();
        }
    }

}