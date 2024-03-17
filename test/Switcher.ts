import {
  loadFixture, mine,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {parseUnits, ZeroAddress} from "ethers";
import {depositToVault} from "./helpers/VaultHelpers";
import {increase} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";


describe("Switcher", function () {
  async function deployVaultAndSwitcherAndStrategies() {
    const [deployer, governance, user1, user2] = await ethers.getSigners();
    const weth = await (await ethers.getContractFactory("WETH9")).deploy()
    const switcher = await (await ethers.getContractFactory("Switcher")).deploy(governance.address)
    const vault = await (await ethers.getContractFactory("ZkETH")).deploy(await weth.getAddress(), await switcher.getAddress())
    const strategy1 = await (await ethers.getContractFactory("MockStrategy")).deploy(await switcher.getAddress())
    const strategy2 = await (await ethers.getContractFactory("MockStrategy")).deploy(await switcher.getAddress())

    return {
      vault,
      switcher,
      deployer,
      governance,
      user1,
      user2,
      weth,
      strategy1,
      strategy2,
    };
  }

  describe("Strategies managing", function () {
    it("Add strategy, use vault", async function () {
      const { vault, switcher, weth, governance, strategy1 , user1} = await loadFixture(deployVaultAndSwitcherAndStrategies);

      const strategy1Address = await strategy1.getAddress()
      await expect(switcher.initStrategy(strategy1Address)).to.be.revertedWithCustomError(switcher, "OnlyGovernanceCanDoThis")
      await switcher.connect(governance).initStrategy(strategy1Address)
      expect(await switcher.strategy()).to.equal(strategy1Address)

      await expect(switcher.connect(governance).initStrategy(strategy1Address)).to.be.revertedWithCustomError(switcher, "Already")

      const amount1 = parseUnits("10.4", 18)
      await depositToVault(user1, vault, weth, amount1)

      await mine(5)
      await vault.connect(user1).withdraw(amount1 / 2n, user1.address, user1.address)
      await mine(5)
      await vault.connect(user1).withdraw(amount1 - amount1 / 2n, user1.address, user1.address)
    })

    it("Switch strategy", async function () {
      const { vault, switcher, weth, governance, strategy1, strategy2, user1} = await loadFixture(deployVaultAndSwitcherAndStrategies);

      const strategy1Address = await strategy1.getAddress()
      const strategy2Address = await strategy2.getAddress()

      // set first strategy and deposit to vault
      await switcher.connect(governance).initStrategy(strategy1Address)
      await depositToVault(user1, vault, weth, parseUnits("1"))

      // announce new strategy
      await expect(switcher.announceNewStrategy(strategy2Address)).to.be.revertedWithCustomError(switcher, "OnlyGovernanceCanDoThis");
      await switcher.connect(governance).announceNewStrategy(strategy2Address)
      expect(await switcher.announcedPendingStrategy()).to.equal(strategy2Address)
      await expect(switcher.connect(governance).announceNewStrategy(strategy2Address)).to.be.revertedWithCustomError(switcher, "Already");

      // cancel and re-announce
      await expect(switcher.cancelAnnouncedStrategy()).to.be.revertedWithCustomError(switcher, "OnlyGovernanceCanDoThis");
      await switcher.connect(governance).cancelAnnouncedStrategy()
      await switcher.connect(governance).cancelAnnouncedStrategy()
      await switcher.connect(governance).announceNewStrategy(strategy2Address)

      // start switching
      await expect(switcher.startStrategySwitching()).to.be.revertedWithCustomError(switcher, "Timelock")
      await increase(86400)
      await strategy1.setBridgedAssets(1n)
      await switcher.startStrategySwitching()
      await strategy1.setBridgedAssets(0n)
      await strategy1.setTotalRequested(0n)
      expect(await switcher.announcedPendingStrategy()).to.equal(ZeroAddress)
      expect(await switcher.pendingStrategy()).to.equal(strategy2Address)
      await expect(switcher.startStrategySwitching()).to.be.revertedWithCustomError(switcher, "NoNewStrategyAnnounced")


      // deposits and withdrawals are forbidden while switching
      await expect(vault.connect(user1).redeem(parseUnits("0.5"), user1.address, user1.address)).to.be.revertedWithCustomError(switcher, "StrategyIsNowSwitching")
      await expect(depositToVault(user1, vault, weth, parseUnits("1"))).to.be.revertedWithCustomError(switcher, "StrategyIsNowSwitching")

      // finish switching
      await strategy1.setBridgedAssets(1n)
      await expect(switcher.finishStrategySwitching()).to.be.revertedWithCustomError(switcher, "AssetsHaveNotYetBeenBridged")
      await strategy1.setBridgedAssets(0n)
      await switcher.finishStrategySwitching()
      await expect(switcher.finishStrategySwitching()).to.be.revertedWithCustomError(switcher, "StrategyIsNotSwitchingNow")

      await depositToVault(user1, vault, weth, parseUnits("1"))

    })
  })

  describe("Access check", function () {
    it("Only vault", async function () {
      const {  switcher,} = await loadFixture(deployVaultAndSwitcherAndStrategies);

      await expect(switcher.investAll()).to.be.revertedWithCustomError(switcher, "OnlyVaultCanDoThis")
    })
  })

  describe("Specific cases", function () {
    it("Decreasing of share price is allowed", async function () {
      const { vault, switcher, weth, governance, strategy1 , user1} = await loadFixture(deployVaultAndSwitcherAndStrategies);

      await switcher.connect(governance).initStrategy(await strategy1.getAddress())

      await depositToVault(user1, vault, weth, parseUnits('100'))

      await strategy1.lossMoney()

      await mine(5)
      await vault.connect(user1).redeem(parseUnits('10'), user1.address, user1.address)
      await mine(5)
      await vault.connect(user1).redeem(parseUnits('90') - 10n, user1.address, user1.address)
      await mine(5)
      await vault.connect(user1).withdrawAll()
    })

    it("Strategy loss on withdraw check", async function () {
      const { vault, switcher, weth, governance, strategy1 , user1} = await loadFixture(deployVaultAndSwitcherAndStrategies);
      await switcher.connect(governance).initStrategy(await strategy1.getAddress())

      const depositAmount = 1000000n
      await depositToVault(user1, vault, weth, depositAmount)

      await strategy1.setLossOnWithdraw(true)

      await mine(5)
      await expect(vault.connect(user1).redeem(depositAmount - 2n, user1.address, user1.address)).to.be.revertedWithCustomError(vault, 'Slippage')
    })
  })

})
