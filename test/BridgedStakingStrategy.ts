import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import {ethers, upgrades} from "hardhat";
import {parseUnits, ZeroAddress, parseEther} from "ethers";
import {depositToVault} from "./helpers/VaultHelpers";
import {PolygonZkEVMBridgeV2, PolygonZkEVMGlobalExitRoot} from "../typechain-types";
import {mine} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/mine";
import {increase} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/increase";
import {BridgeHelper} from "./helpers/BridgeHelper";

describe("BridgedStakingStrategy", function () {
  upgrades.silenceWarnings();

  let polygonZkEVMBridgeContractMainnet: PolygonZkEVMBridgeV2;
  let polygonZkEVMGlobalExitRootMainnet: PolygonZkEVMGlobalExitRoot;

  let polygonZkEVMBridgeContractL2: PolygonZkEVMBridgeV2;
  let polygonZkEVMGlobalExitRootL2: PolygonZkEVMGlobalExitRoot;

  const networkIDMainnet = 0;
  const networkIDRollup = 1;
  const LEAF_TYPE_ASSET = 0;
  const LEAF_TYPE_MESSAGE = 1;

  async function deployBridgeVaultStrategy() {
    const [deployer, rollupManager, acc1, governance, user1, user2] = await ethers.getSigners();

    const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
    const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");

    // Deploy MAINNET
    // deploy PolygonZkEVMBridge
    polygonZkEVMBridgeContractMainnet = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
      initializer: false,
      unsafeAllow: ["constructor"],
    })) as unknown as PolygonZkEVMBridgeV2;
    // deploy global exit root manager
    polygonZkEVMGlobalExitRootMainnet = await PolygonZkEVMGlobalExitRootFactory.deploy(
      rollupManager.address,
      polygonZkEVMBridgeContractMainnet.target
    );
    // init bridge
    await polygonZkEVMBridgeContractMainnet.initialize(
      networkIDMainnet,
      ethers.ZeroAddress, // zero for ether
      ethers.ZeroAddress, // zero for ether
      polygonZkEVMGlobalExitRootMainnet.target,
      rollupManager.address,
      "0x"
    );

    // Deploy L2
    // deploy PolygonZkEVMBridge
    polygonZkEVMBridgeContractL2 = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
      initializer: false,
      unsafeAllow: ["constructor"],
    })) as unknown as PolygonZkEVMBridgeV2;
    // deploy global exit root manager
    polygonZkEVMGlobalExitRootL2 = await PolygonZkEVMGlobalExitRootFactory.deploy(
      rollupManager.address,
      polygonZkEVMBridgeContractL2.target
    );
    // init bridge
    await polygonZkEVMBridgeContractL2.initialize(
      networkIDRollup,
      ethers.ZeroAddress, // zero for ether
      ethers.ZeroAddress, // zero for ether
      polygonZkEVMGlobalExitRootL2.target,
      ZeroAddress,
      "0x"
    );

    const weth = await (await ethers.getContractFactory("WETH9")).deploy()
    const switcher = await (await ethers.getContractFactory("Switcher")).deploy(governance.address)
    const rewardToken = await (await ethers.getContractFactory("MockERC20")).deploy("DIVA premint receipt", "preDIVA", 18n)
    const gauge = await (await ethers.getContractFactory("Gauge")).deploy(await rewardToken.getAddress(), 86400n * 7n, governance.address)
    const vault = await (await ethers.getContractFactory("ZkETH")).deploy(await weth.getAddress(), await switcher.getAddress(), await gauge.getAddress())
    const strategy = await (await ethers.getContractFactory("BridgedStakingStrategy")).deploy(
      await switcher.getAddress(),
      await polygonZkEVMBridgeContractL2.getAddress(),
      networkIDMainnet
    )

    await switcher.connect(governance).initStrategy(await strategy.getAddress())

    const comptroller = ZeroAddress
    const depositWrapper = ZeroAddress
    const wethMainnet = ZeroAddress
    const enzymeStaker = await (await ethers.getContractFactory("EnzymeStaker")).deploy(
      await polygonZkEVMBridgeContractMainnet.getAddress(),
      comptroller,
      depositWrapper,
      await strategy.getAddress(),
      networkIDMainnet,
      networkIDRollup,
      wethMainnet
    )

    return {
      vault,
      switcher,
      deployer,
      governance,
      user1,
      user2,
      weth,
      strategy,
      polygonZkEVMBridgeContractMainnet,
      polygonZkEVMBridgeContractL2,
      polygonZkEVMGlobalExitRootL2,
      enzymeStaker,
      rollupManager,
    };
  }

  describe("Asset bridging", function () {
    it("Bridge asset", async function () {
      const { vault, switcher, weth, strategy , user1, governance, enzymeStaker} = await loadFixture(deployBridgeVaultStrategy);

      const amount1 = parseUnits("10.4", 18)
      await depositToVault(user1, vault, weth, amount1)

      const vaultBuffer = amount1 * await vault.BUFFER() / await vault.BUFFER_DENOMINATOR()
      expect(await strategy.totalAssets()).to.equal(amount1 - vaultBuffer)
      expect(await strategy.bridgedAssets()).to.equal(0n)

      const canBridgeAssetsReturn = await strategy.needBridgingNow()
      expect(canBridgeAssetsReturn[0]).to.equal(true)
      expect(canBridgeAssetsReturn[1]).to.equal(true)
      expect(canBridgeAssetsReturn[2]).to.equal(amount1 - vaultBuffer)

      await expect(strategy.callBridge()).to.be.revertedWithCustomError(strategy, 'DestinationIsNotSet')

      await strategy.connect(governance).setDestination(await enzymeStaker.getAddress())

      await strategy.callBridge()

      expect(await strategy.bridgedAssets()).to.equal(amount1 - vaultBuffer)
    })

    it("Request all assets", async function () {
      const {
        vault,
        weth,
        strategy ,
        user1,
        governance,
        enzymeStaker,
        polygonZkEVMGlobalExitRootL2,
        rollupManager,
      } = await loadFixture(deployBridgeVaultStrategy);
      await strategy.connect(governance).setDestination(await enzymeStaker.getAddress())
      const amount1 = parseUnits("10.4", 18)
      await depositToVault(user1, vault, weth, amount1)
      await strategy.callBridge()
      await vault.connect(user1).approve(await strategy.getAddress(), amount1)
      await strategy.connect(user1).requestClaimAssets(amount1)
      await increase(86400)
      const canBridgeMessage = await strategy.needBridgingNow()
      await strategy.callBridge()
      const amount = canBridgeMessage[2] - canBridgeMessage[2] / 10000n
      const msg = await BridgeHelper.prepareClaimAssetL2(
        rollupManager,
        await strategy.getAddress(),
        amount,
        polygonZkEVMGlobalExitRootL2
      )
      await polygonZkEVMBridgeContractL2.claimAsset(
        msg.proofLocal,
        msg.proofRollup,
        msg.globalIndex,
        msg.mainnetExitRoot,
        msg.rollupExitRoot,
        networkIDMainnet,
        ZeroAddress,
        networkIDRollup,
        await strategy.getAddress(),
        amount,
        msg.metadata
      )
      await mine(5)
      await strategy.claimRequestedAssets([user1.address])

    })

    it("Request assets", async function () {
      const {
        vault,
        weth,
        strategy ,
        user1,
        governance,
        enzymeStaker,
        polygonZkEVMGlobalExitRootL2,
        rollupManager,
      } = await loadFixture(deployBridgeVaultStrategy);
      await strategy.connect(governance).setDestination(await enzymeStaker.getAddress())

      await expect(strategy.callBridge()).to.be.revertedWithCustomError(strategy, 'CantBridge')

      const amount1 = parseUnits("10.4", 18)
      await depositToVault(user1, vault, weth, amount1)

      const vaultBuffer = amount1 * await vault.BUFFER() / await vault.BUFFER_DENOMINATOR()

      await strategy.callBridge()

      const amountOfSharesToWithdraw = parseUnits("5.0", 18)

      await expect(vault.redeem(amountOfSharesToWithdraw, user1.address, user1.address)).to.be.revertedWithCustomError(vault, "WaitAFewBlocks")

      await mine(5)
      await expect(vault.redeem(amountOfSharesToWithdraw, user1.address, user1.address)).to.be.revertedWithCustomError(strategy, "NotEnoughBridgedAssets")
      await expect(vault.connect(user1).withdrawAll()).to.revertedWithCustomError(strategy, "NotAllAssetsAreBridged")

      await vault.connect(user1).approve(await strategy.getAddress(), amountOfSharesToWithdraw)
      await strategy.connect(user1).requestClaimAssets(amountOfSharesToWithdraw)

      expect(await strategy.requests(user1.address)).equal(amountOfSharesToWithdraw)
      expect(await vault.balanceOf(await strategy.getAddress())).equal(amountOfSharesToWithdraw)
      expect(await strategy.totalRequestedVaultSharesForClaim()).equal(amountOfSharesToWithdraw)
      expect(await strategy.bridgedAssets()).equal(amount1 - vaultBuffer)
      let canBridgeMessage = await strategy.needBridgingNow()
      expect(canBridgeMessage[0]).equal(false)
      expect(canBridgeMessage[2]).equal(amountOfSharesToWithdraw/* - vaultBuffer*/)

      await increase(86400)
      canBridgeMessage = await strategy.needBridgingNow()
      expect(canBridgeMessage[0]).equal(true)
      expect(canBridgeMessage[1]).equal(false)
      expect(canBridgeMessage[2]).equal(amountOfSharesToWithdraw/* - vaultBuffer*/)

      await strategy.callBridge()

      expect(await strategy.pendingRequestedBridgingAssets()).equal(amountOfSharesToWithdraw/* - vaultBuffer*/)
      expect(await strategy.bridgedAssets()).equal(amount1  - amountOfSharesToWithdraw - vaultBuffer)

      /// ====== Claim ether by bridge ======
      const amount = canBridgeMessage[2] - canBridgeMessage[2] / 10000n
      const msg = await BridgeHelper.prepareClaimAssetL2(
        rollupManager,
        await strategy.getAddress(),
        amount,
        polygonZkEVMGlobalExitRootL2
      )
      await expect(
        polygonZkEVMBridgeContractL2.claimAsset(
          msg.proofLocal,
          msg.proofRollup,
          msg.globalIndex,
          msg.mainnetExitRoot,
          msg.rollupExitRoot,
          networkIDMainnet,
          ZeroAddress,
          networkIDRollup,
          await strategy.getAddress(),
          amount,
          msg.metadata
        )
      )
        .to.emit(polygonZkEVMBridgeContractL2, "ClaimEvent")
        .withArgs(0, 0, ZeroAddress, await strategy.getAddress(), amount);

      /// ===================================

      await mine(5)

      await strategy.claimRequestedAssets([user1.address])
      await expect(strategy.claimRequestedAssets([ZeroAddress])).to.revertedWithCustomError(strategy, "NoClaimRequestForUser")

      // claim all
      const totalShares = await vault.balanceOf(user1.address)
      expect(await await vault.totalSupply()).eq(totalShares)
      await vault.connect(user1).approve(await strategy.getAddress(), totalShares)
      await strategy.connect(user1).requestClaimAssets(totalShares)
      await increase(86400)
      await strategy.callBridge()

    })

    it("Switch strategy", async function () {
      const {
        vault,
        weth,
        strategy ,
        user1,
        governance,
        enzymeStaker,
        switcher,
      } = await loadFixture(deployBridgeVaultStrategy);

      await strategy.connect(governance).setDestination(await enzymeStaker.getAddress())
      const amount1 = parseUnits("10.4", 18)
      await depositToVault(user1, vault, weth, amount1)

      await strategy.callBridge()

      const strategy2 = await (await ethers.getContractFactory("MockStrategy")).deploy(await switcher.getAddress())
      const strategy2Address = await strategy2.getAddress()
      await switcher.connect(governance).announceNewStrategy(strategy2Address)
      await increase(86400)
      await switcher.startStrategySwitching()

      await expect(switcher.finishStrategySwitching()).to.revertedWithCustomError(switcher, "AssetsHaveNotYetBeenBridged")

      const bridgeAsSigner = await ethers.getImpersonatedSigner(await strategy.bridge())
      await bridgeAsSigner.sendTransaction({
        to: await strategy.getAddress(),
        value: parseEther("0.5"),
      });

      await switcher.finishStrategySwitching()

      expect(await strategy.totalAssets()).eq(0n)

      await vault.connect(user1).withdrawAll()

    })
  })

  describe("Access", function () {
    it("Set destination", async function () {
      const {strategy , enzymeStaker, governance} = await loadFixture(deployBridgeVaultStrategy);
      await expect(strategy.setDestination(await enzymeStaker.getAddress())).to.be.revertedWithCustomError(strategy, 'OnlyGovernanceCanDoThis')
      await strategy.connect(governance).setDestination(await enzymeStaker.getAddress())
      await expect(strategy.connect(governance).setDestination(await enzymeStaker.getAddress())).to.be.revertedWithCustomError(strategy, 'Already')
    })

    it("withdrawToSwitcher", async function () {
      const {strategy } = await loadFixture(deployBridgeVaultStrategy);
      await expect(strategy.withdrawToSwitcher(1n)).to.be.revertedWithCustomError(strategy, 'OnlySwitcherCanDoThis')
    })

    it("withdrawAllToSwitcher", async function () {
      const {strategy } = await loadFixture(deployBridgeVaultStrategy);
      await expect(strategy.withdrawAllToSwitcher()).to.be.revertedWithCustomError(strategy, 'OnlySwitcherCanDoThis')
    })
  })

})
