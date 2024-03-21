// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@0xpolygonhermez/zkevm-contracts/contracts/v2/interfaces/IPolygonZkEVMBridgeV2.sol";
import "@0xpolygonhermez/zkevm-contracts/contracts/interfaces/IBridgeMessageReceiver.sol";
import "./interfaces/IDepositWrapper.sol";
import "./interfaces/IComptroller.sol";
import "./interfaces/IWETH9.sol";

/// @title Stake bridged ETH to Enzyme Diva Early Staker Vault
/// @author a17
contract EnzymeStaker is IBridgeMessageReceiver {
    address public immutable bridge;

    address public immutable depositWrapper;

    address public immutable comptroller;

    address public immutable strategyL2;

    uint24 internal immutable id;

    uint32 internal immutable idL2;

    address internal immutable weth;

    bool internal isClaiming;

    error ClaimByThisContractOnly();

    event Setup(address bridge, address comptroller, address depositWrapper, address strategyL2, uint24 id, uint32 idL2, address weth);
    event ClaimRedemption(uint amount, uint gotEther);

    constructor(address bridge_, address comptroller_, address depositWrapper_, address strategyL2_, uint24 id_, uint24 idL2_, address weth_) {
        bridge = bridge_;
        depositWrapper = depositWrapper_;
        comptroller = comptroller_;
        strategyL2 = strategyL2_;
        id = id_;
        idL2 = idL2_;
        weth = weth_;

        emit Setup(bridge_, comptroller_, depositWrapper_, strategyL2_, id_, idL2_, weth_);
    }

    receive() external payable {
        if (bridge == msg.sender) {
            IDepositWrapper(depositWrapper).exchangeEthAndBuyShares{value: msg.value}(
                comptroller,
                1,
                address(0),
                address(0),
                "",
                0
            );
        }
    }

    function onMessageReceived(
        address,
        uint32,
        bytes memory
    ) external payable {
        if (!isClaiming) {
            revert ClaimByThisContractOnly();
        }
    }

    function claimMessage(
        bytes32[32] calldata smtProofLocalExitRoot,
        bytes32[32] calldata smtProofRollupExitRoot,
        uint globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        bytes calldata metadata
    ) external {
        isClaiming = true;
        IPolygonZkEVMBridgeV2(bridge).claimMessage(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            idL2,
            strategyL2,
            id,
            address(this),
            0,
            metadata
        );
        isClaiming = false;

        uint amount = _toUint(metadata, 0);

        IComptroller(comptroller).redeemSharesInKind(
            address(this),
            amount,
            new address[](0),
            new address[](0)
        );

        address _weth = weth;

        uint balance = IERC20(_weth).balanceOf(address(this));
        IWETH9(_weth).withdraw(balance);

        IPolygonZkEVMBridgeV2(bridge).bridgeAsset{value: balance}(
            idL2,
            strategyL2,
            balance,
            address(0),
            true,
            bytes("0")
        );

        emit ClaimRedemption(amount, balance);
    }

    function _toUint(bytes memory _bytes, uint _start) internal pure returns (uint out) {
        assembly {
            out := mload(add(add(_bytes, 0x20), _start))
        }
    }

}
