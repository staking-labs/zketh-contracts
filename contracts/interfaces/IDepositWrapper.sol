// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDepositWrapper {
    /// @notice Exchanges ETH into a fund's denomination asset and then buys shares
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the sent ETH
    /// @param _exchange The exchange on which to execute the swap to the denomination asset
    /// @param _exchangeApproveTarget The address that should be given an allowance of WETH
    /// for the given _exchange
    /// @param _exchangeData The data with which to call the exchange to execute the swap
    /// to the denomination asset
    /// @param _exchangeMinReceived The minimum amount of the denomination asset
    /// to receive in the trade for investment (not necessary for WETH)
    /// @return sharesReceived_ The actual amount of shares received
    /// @dev Use a reasonable _exchangeMinReceived always, in case the exchange
    /// does not perform as expected (low incoming asset amount, blend of assets, etc).
    /// If the fund's denomination asset is WETH, _exchange, _exchangeApproveTarget, _exchangeData,
    /// and _exchangeMinReceived will be ignored.
    function exchangeEthAndBuyShares(
        address _comptrollerProxy,
        uint _minSharesQuantity,
        address _exchange,
        address _exchangeApproveTarget,
        bytes calldata _exchangeData,
        uint _exchangeMinReceived
    ) external payable returns (uint sharesReceived_);

}
