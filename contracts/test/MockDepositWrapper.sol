// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDepositWrapper} from "../interfaces/IDepositWrapper.sol";
import {IWETH9} from "../interfaces/IWETH9.sol";
import {MockComptroller} from "./MockComptroller.sol";

contract MockDepositWrapper is IDepositWrapper {
    address public immutable comptroller;
    address public immutable weth;

    constructor(address comptroller_, address weth_) {
        comptroller = comptroller_;
        weth = weth_;
    }

    function exchangeEthAndBuyShares(
        address _comptrollerProxy,
        uint,
        address,
        address,
        bytes calldata,
        uint
    ) external payable returns (uint sharesReceived_) {
        IWETH9(weth).deposit{value: msg.value}();
        uint fee = msg.value / 10000;
        IERC20(weth).transfer(_comptrollerProxy, msg.value - fee);
        sharesReceived_ = msg.value;
        MockComptroller(_comptrollerProxy).addUserBalance(msg.sender, msg.value);
    }
}
