import {
  loadFixture, mine,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {MaxUint256, parseUnits, ZeroAddress} from "ethers";


describe("Vault", function () {
  async function deployVaultAndSwitcher() {
    const [deployer, governance, user1, user2] = await ethers.getSigners();

    const weth = await (await ethers.getContractFactory("MockERC20")).deploy("Mock Wrapped Ether", "WETH", 18)
    const switcher = await (await ethers.getContractFactory("Switcher")).deploy(governance.address)
    const vault = await (await ethers.getContractFactory("ZkETH")).deploy(await weth.getAddress(), await switcher.getAddress())

    return {
      vault,
      switcher,
      deployer,
      governance,
      user1,
      user2,
      weth,
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
      const {vault, switcher, weth, user1, user2} = await loadFixture(deployVaultAndSwitcher);

      // fill test users accounts
      await weth.connect(user1).mint(parseUnits("100", 18))
      await weth.connect(user2).mint(parseUnits("100", 18))
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
    });

  });

  /*
  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.unlockTime()).to.equal(unlockTime);
    });

    it("Should set the right owner", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.owner()).to.equal(owner.address);
    });

    it("Should receive and store the funds to lock", async function () {
      const { lock, lockedAmount } = await loadFixture(
        deployOneYearLockFixture
      );

      expect(await ethers.provider.getBalance(lock.target)).to.equal(
        lockedAmount
      );
    });

    it("Should fail if the unlockTime is not in the future", async function () {
      // We don't use the fixture here because we want a different deployment
      const latestTime = await time.latest();
      const Lock = await ethers.getContractFactory("Lock");
      await expect(Lock.deploy(latestTime, { value: 1 })).to.be.revertedWith(
        "Unlock time should be in the future"
      );
    });
  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);

        await expect(lock.withdraw()).to.be.revertedWith(
          "You can't withdraw yet"
        );
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(
          deployOneYearLockFixture
        );

        // We can increase the time in Hardhat Network
        await time.increaseTo(unlockTime);

        // We use lock.connect() to send a transaction from another account
        await expect(lock.connect(otherAccount).withdraw()).to.be.revertedWith(
          "You aren't the owner"
        );
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        // Transactions are sent using the first signer by default
        await time.increaseTo(unlockTime);

        await expect(lock.withdraw()).not.to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {
        const { lock, unlockTime, lockedAmount } = await loadFixture(
          deployOneYearLockFixture
        );

        await time.increaseTo(unlockTime);

        await expect(lock.withdraw())
          .to.emit(lock, "Withdrawal")
          .withArgs(lockedAmount, anyValue); // We accept any value as `when` arg
      });
    });

    describe("Transfers", function () {
      it("Should transfer the funds to the owner", async function () {
        const { lock, unlockTime, lockedAmount, owner } = await loadFixture(
          deployOneYearLockFixture
        );

        await time.increaseTo(unlockTime);

        await expect(lock.withdraw()).to.changeEtherBalances(
          [owner, lock],
          [lockedAmount, -lockedAmount]
        );
      });
    });
  });
  * */
});
