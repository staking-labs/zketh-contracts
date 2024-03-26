import {
  loadFixture, mine,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {MaxUint256, parseUnits, ZeroAddress} from "ethers";


describe("Vault", function () {
  async function deployVaultAndSwitcher() {
    const [deployer, governance, user1, user2] = await ethers.getSigners();

    const weth = await (await ethers.getContractFactory("WETH9")).deploy()
    const switcher = await (await ethers.getContractFactory("Switcher")).deploy(governance.address)
    const rewardToken = await (await ethers.getContractFactory("MockERC20")).deploy("DIVA premint receipt", "preDIVA", 18n)
    const rewardToken2= await (await ethers.getContractFactory("MockERC20")).deploy("DIVA premint receipt 2", "preDIVA2", 18n)
    const gauge = await (await ethers.getContractFactory("Gauge")).deploy(await rewardToken.getAddress(), 86400n * 7n, governance.address)
    const vault = await (await ethers.getContractFactory("ZkETH")).deploy(await weth.getAddress(), await switcher.getAddress(), await gauge.getAddress())

    await rewardToken.mint(parseUnits("1"))
    await rewardToken.approve(await gauge.getAddress(), parseUnits("1"))
    await gauge.notifyRewardAmount(await rewardToken.getAddress(), parseUnits("0.5"))
    await gauge.notifyRewardAmount(await rewardToken.getAddress(), parseUnits("0.5"))

    return {
      vault,
      switcher,
      deployer,
      governance,
      user1,
      user2,
      weth,
      gauge,
      rewardToken,
      rewardToken2,
    };
  }

  describe("Empty vault w/o strategy", function () {
    it("View functions should work as expected", async function () {
      const { vault, switcher, weth, governance } = await loadFixture(deployVaultAndSwitcher);

      // IERC4626
      expect(await vault.asset()).to.equal(await weth.getAddress())
      expect(await vault.totalAssets()).to.equal(0n);
      expect(await vault.convertToShares(1000n)).to.equal(1000n);
      expect(await vault.convertToAssets(1000n)).to.equal(1000n);
      expect(await vault.maxDeposit(ZeroAddress)).to.equal(MaxUint256);
      expect(await vault.maxMint(ZeroAddress)).to.equal(MaxUint256);
      expect(await vault.maxWithdraw(ZeroAddress)).to.equal(0n);
      expect(await vault.maxRedeem(ZeroAddress)).to.equal(0n);
      expect(await vault.previewDeposit(1000n)).to.equal(1000n);
      expect(await vault.previewMint(1000n)).to.equal(1000n);
      expect(await vault.previewWithdraw(1000n)).to.equal(1000n);
      expect(await vault.previewRedeem(1000n)).to.equal(1000n);

      // zkETH
      expect(await vault.BUFFER_DENOMINATOR()).to.equal(100_000n);
      expect(await vault.switcher()).to.equal(await switcher.getAddress());
      expect(await vault.withdrawRequestBlocks()).to.equal(5n);
      expect(await vault.sharePrice()).to.equal(parseUnits('1', 18));

      // Switcher
      expect(await switcher.asset()).to.equal(await weth.getAddress());
      expect(await switcher.vault()).to.equal(await vault.getAddress());
      expect(await switcher.strategy()).to.equal(ZeroAddress);
      expect(await switcher.governance()).to.equal(governance.address);
      expect(await switcher.totalAssets()).to.equal(0n);
    });

    it("Deposits, withdrawals", async function () {
      const {
        vault,
        switcher,
        weth,
        user1,
        user2,
        gauge,
        rewardToken,
        rewardToken2,
        governance,
      } = await loadFixture(deployVaultAndSwitcher);

      // fill test users accounts
      await weth.connect(user1).deposit({value: parseUnits("100", 18)})
      await weth.connect(user2).deposit({value: parseUnits("100", 18)})
      const user1BalanceBefore = await weth.balanceOf(user1.address)
      const user2BalanceBefore = await weth.balanceOf(user2.address)

      // deposit to vault
      const amount1 = parseUnits("10.4", 18)
      const amount2 = parseUnits("12.33333333", 18)
      await weth.connect(user1).approve(await vault.getAddress(), amount1 + 1n)
      await weth.connect(user2).approve(await vault.getAddress(), amount2)
      await vault.connect(user1).deposit(amount1, user1.address)
      await vault.connect(user2).mint(amount2, user2.address)

      // check vault balances and underlying balances
      expect(await vault.sharePrice()).to.equal(parseUnits("1", 18))
      expect(await vault.balanceOf(user1.address)).to.equal(amount1)
      expect(await vault.balanceOf(user2.address)).to.equal(amount2)
      const vaultWethBalance = await weth.balanceOf(await vault.getAddress())
      const switcherWethBalance = await weth.balanceOf(await switcher.getAddress())
      const totalAssetsInTest =
        await weth.balanceOf(user1.address)
        + await weth.balanceOf(user2.address)
        + vaultWethBalance
        + switcherWethBalance
      expect(totalAssetsInTest).to.equal(user1BalanceBefore + user2BalanceBefore)
      const vaultBuffer = (amount1 + amount2) * 1000n / 100_000n
      expect(vaultWethBalance).to.equal(vaultBuffer)
      expect(switcherWethBalance).to.equal(amount1 + amount2 - vaultBuffer)

      // small deposit
      await vault.connect(user1).deposit(1n, user1.address)

      // transfer
      await vault.connect(user1).transfer(user2.address, 1n);
      await vault.connect(user2).transfer(user1.address, 1n);


      // withdraw, defence
      await expect(vault.connect(user1).withdraw(amount1, user1.address, user1.address)).to.be.revertedWithCustomError(vault,'WaitAFewBlocks')
      await mine(2)
      await expect(vault.connect(user1).withdraw(amount1, user1.address, user1.address)).to.be.revertedWithCustomError(vault,'WaitAFewBlocks')
      await mine(2)
      await vault.connect(user1).withdraw(amount1 + 1n, user1.address, user1.address)
      await expect(vault.connect(user1).withdraw(2n, user1.address, user1.address)).to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxWithdraw")
      await expect(vault.connect(user1).redeem(2n, user1.address, user1.address)).to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxRedeem")
      await expect(vault.connect(user1).redeem(0n, user1.address, user1.address)).to.be.revertedWithCustomError(vault, "ZeroAmount")
      await vault.connect(user2).redeem(100n, user2.address, user2.address)
      await mine(5)
      await vault.connect(user2).redeem(amount2 / 3n, user2.address, user2.address)
      await expect(vault.connect(user2).withdrawAll()).to.be.revertedWithCustomError(vault,'WaitAFewBlocks')
      await mine(5)
      await vault.connect(user2).withdrawAll()

      // cover gauge
      await gauge.connect(governance).registerRewardToken(await rewardToken2.getAddress())
      await weth.connect(user1).approve(await vault.getAddress(), 1n)
      await vault.connect(user1).deposit(1n, user1.address)
      expect(await gauge.left(await rewardToken.getAddress())).gt(0n)
      await gauge.connect(user1).getAllRewards(user1.address)
      await gauge.connect(user1).getReward(user1.address, [await rewardToken.getAddress()])
      await gauge.connect(governance).removeRewardToken(await rewardToken2.getAddress())
      expect(await gauge.rewardTokensLength()).eq(0n)
    });

  });

});
