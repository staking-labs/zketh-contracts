// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRewardToken {
    function minter() external view returns(address);

    function mint(uint amount) external;

}