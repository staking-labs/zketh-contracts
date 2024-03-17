// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ISwitcher.sol";

/// @title Diva liquid staked Ether on zkEVM
/// @author a17
contract ZkETH is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         CONSTANTS                          */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @dev Percent of assets that will always stay in this vault.
    uint constant public BUFFER = 1_000;

    /// @dev Denominator for buffer calculation. 100% of the buffer amount.
    uint constant public BUFFER_DENOMINATOR = 100_000;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                          STORAGE                           */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @notice The switcher manages the staking strategy
    address public immutable switcher;

    /// @dev A user should wait this block amounts before able to withdraw.
    uint public withdrawRequestBlocks;

    /// @dev msg.sender => block when request sent. Should be cleared on deposit/withdraw action
    ///      For simplification we are setup new withdraw request on each deposit/transfer
    mapping(address => uint) public withdrawRequests;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                          EVENTS                            */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    event Invest(address switcher, uint amount);

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       CUSTOM ERRORS                        */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    error WaitAFewBlocks();
    error ZeroAmount();
    error Slippage();

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      INITIALIZATION                        */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    constructor(address weth, address switcher_) ERC20("Synthetic Diva ETH", "zkETH") ERC4626(IERC20(weth)) {
        switcher = switcher_;
        withdrawRequestBlocks = 5;
        ISwitcher(switcher_).setup(weth);
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         USER ACTIONS                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @inheritdoc IERC4626
    function deposit(uint assets, address receiver) public override nonReentrant returns (uint) {
        uint shares = super.deposit(assets, receiver);
        _afterDeposit(assets, shares, receiver);
        return shares;
    }

    /// @inheritdoc IERC4626
    function mint(uint shares, address receiver) public override nonReentrant returns (uint) {
        uint assets = super.mint(shares, receiver);
        _afterDeposit(assets, shares, receiver);
        return assets;
    }

    /// @inheritdoc IERC4626
    function withdraw(
        uint assets,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint) {
        uint maxAssets = maxWithdraw(owner);
        if (assets > maxAssets) {
            revert ERC4626ExceededMaxWithdraw(owner, assets, maxAssets);
        }

        uint shares = previewWithdraw(assets);

        _beforeWithdraw(assets, shares, owner);

        _withdraw(_msgSender(), receiver, owner, assets, shares);

        return shares;
    }

    /// @inheritdoc IERC4626
    function redeem(
        uint shares,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint) {
        uint maxShares = maxRedeem(owner);
        if (shares > maxShares) {
            revert ERC4626ExceededMaxRedeem(owner, shares, maxShares);
        }

        uint assets = previewRedeem(shares);

        if (assets == 0) {
            revert ZeroAmount();
        }

        _beforeWithdraw(assets, shares, owner);

        _withdraw(_msgSender(), receiver, owner, assets, shares);

        return assets;
    }

    /// @dev Withdraw all available shares for tx sender.
    ///      The revert is expected if the balance is higher than `maxRedeem`
    ///      It suppose to be used only on UI - for on-chain interactions withdraw concrete amount with properly checks.
    function withdrawAll() external {
        redeem(balanceOf(msg.sender), msg.sender, msg.sender);
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      VIEW FUNCTIONS                        */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @dev Total amount of the underlying asset that is “managed” by Vault
    function totalAssets() public view override returns (uint) {
        return IERC20(asset()).balanceOf(address(this)) + ISwitcher(switcher).totalAssets();
    }

    /// @dev Price of 1 full share
    function sharePrice() external view returns (uint) {
        uint units = 10 ** uint256(decimals());
        uint totalSupply_ = totalSupply();
        return totalSupply_ == 0
            ? units
            : units * totalAssets() / totalSupply_;
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       INTERNAL LOGIC                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /// @dev Calculate available to invest amount and send this amount to strategy
    function _afterDeposit(uint, /*assets*/ uint, /*shares*/ address receiver) internal {
        withdrawRequests[receiver] = block.number;

        address _switcher = switcher;
        IERC20 asset_ = IERC20(asset());
        uint256 toInvest = _availableToInvest(_switcher, asset_);
        // invest only when buffer is filled
        if (toInvest > 0) {
            asset_.safeTransfer(_switcher, toInvest);
            ISwitcher(_switcher).investAll();
            emit Invest(_switcher, toInvest);
        }

    }

    /// @notice Returns amount of assets ready to invest to the switcher
    function _availableToInvest(address _switcher, IERC20 asset_) internal view returns (uint) {
        uint assetsInVault = asset_.balanceOf(address(this));
        uint assetsInSwitcher = ISwitcher(_switcher).totalAssets();
        uint wantInvestTotal = (assetsInVault + assetsInSwitcher)
            * (BUFFER_DENOMINATOR - BUFFER) / BUFFER_DENOMINATOR;
        if (assetsInSwitcher >= wantInvestTotal) {
            return 0;
        }

        uint remainingToInvest = wantInvestTotal - assetsInSwitcher;
        return remainingToInvest <= assetsInVault ? remainingToInvest : assetsInVault;
    }

    /// @dev Internal hook for getting necessary assets from strategy.
    function _beforeWithdraw(uint assets, uint shares, address owner) internal {
        if (withdrawRequests[owner] + withdrawRequestBlocks >= block.number) {
            revert WaitAFewBlocks();
        }
        withdrawRequests[owner] = block.number;

        IERC20 asset_ = IERC20(asset());
        uint balance = asset_.balanceOf(address(this));
        // if not enough balance in the vault withdraw from strategies
        if (balance < assets) {
            _processWithdrawFromSwitcher(
                assets,
                shares,
                totalSupply(),
                ISwitcher(switcher),
                balance
            );
        }
        balance = asset_.balanceOf(address(this));
        if (assets > balance) {
            revert Slippage();
        }
    }

    /// @dev Do necessary calculation for withdrawing from switcher and move assets to vault.
    ///      If switcher not defined must not be called.
    function _processWithdrawFromSwitcher(
        uint assetsNeed,
        uint shares,
        uint totalSupply_,
        ISwitcher _switcher,
        uint assetsInVault
    ) internal {
        // withdraw everything from the switcher to accurately check the share value
        if (shares == totalSupply_) {
            _switcher.withdrawAllToVault();
        } else {
            uint assetsInSwitcher = _switcher.totalAssets();

            // we should always have buffer amount inside the vault
            // assume `assetsNeed` can not be higher than entire balance
            uint expectedBuffer = (assetsInSwitcher + assetsInVault - assetsNeed) * BUFFER / BUFFER_DENOMINATOR;

            // this code should not be called if `assetsInVault` higher than `assetsNeed`
            uint missing = Math.min(expectedBuffer + assetsNeed - assetsInVault, assetsInSwitcher);
            // if zero should be resolved on switcher side
            _switcher.withdrawToVault(missing);
        }
    }

    function _update(address from, address to, uint value) internal virtual override {
        super._update(from, to, value);
        withdrawRequests[from] = block.number;
        withdrawRequests[to] = block.number;
    }

}
