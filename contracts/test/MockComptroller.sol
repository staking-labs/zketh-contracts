// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";

contract MockComptroller is IComptroller {

    address public weth;

    uint public totalUserShares;

    mapping(address => uint) public userBalance;

    constructor(address weth_) {
        weth = weth_;
    }

    function redeemSharesInKind(
        address _recipient,
        uint256 _sharesQuantity,
        address[] calldata,
        address[] calldata
    ) external returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_) {
        uint _userBalance = userBalance[msg.sender];
        if (_sharesQuantity == type(uint).max) {
            _sharesQuantity = _userBalance;
        } else {
            require(_userBalance >= _sharesQuantity, "Not enough balance");
        }
        uint totalWethBalance = IERC20(weth).balanceOf(address(this));
        uint forUser = totalWethBalance * _sharesQuantity / totalUserShares;
        IERC20(weth).transfer(_recipient, forUser);
        userBalance[msg.sender] = _userBalance - _sharesQuantity;
        totalUserShares -= _sharesQuantity;
        payoutAssets_ = new address[](0);
        payoutAmounts_ = new uint[](0);
    }

    function addUserBalance(address user, uint amountShares) external {
        userBalance[user] += amountShares;
        totalUserShares += amountShares;
    }
}
