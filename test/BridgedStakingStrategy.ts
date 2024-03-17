import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import {ethers, upgrades} from "hardhat";
import {parseUnits, ZeroAddress} from "ethers";
import {depositToVault} from "./helpers/VaultHelpers";
import {PolygonZkEVMBridgeV2, PolygonZkEVMGlobalExitRoot} from "../typechain-types";
import {mine} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/mine";
import {increase} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/increase";
// @ts-ignore
import {MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
  return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
  if (isMainnet) {
    return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
  } else {
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
  }
}

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
    const vault = await (await ethers.getContractFactory("ZkETH")).deploy(await weth.getAddress(), await switcher.getAddress())
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

      const canBridgeAssetsReturn = await strategy.canBridgeAssets()
      expect(canBridgeAssetsReturn[0]).to.equal(true)
      expect(canBridgeAssetsReturn[1]).to.equal(amount1 - vaultBuffer)

      await expect(strategy.bridgeAssets()).to.be.revertedWithCustomError(strategy, 'DestinationIsNotSet')

      await strategy.connect(governance).setDestination(await enzymeStaker.getAddress())

      await strategy.bridgeAssets()

      expect(await strategy.bridgedAssets()).to.equal(amount1 - vaultBuffer)
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

      const amount1 = parseUnits("10.4", 18)
      await depositToVault(user1, vault, weth, amount1)

      const vaultBuffer = amount1 * await vault.BUFFER() / await vault.BUFFER_DENOMINATOR()

      await strategy.bridgeAssets({gasLimit: 15_000_000})

      const amountOfSharesToWithdraw = parseUnits("5.0", 18)

      await expect(vault.redeem(amountOfSharesToWithdraw, user1.address, user1.address)).to.be.revertedWithCustomError(vault, "WaitAFewBlocks")

      await mine(5)

      await expect(vault.redeem(amountOfSharesToWithdraw, user1.address, user1.address)).to.be.revertedWithCustomError(strategy, "NotEnoughBridgedAssets")

      await vault.connect(user1).approve(await strategy.getAddress(), amountOfSharesToWithdraw)
      await strategy.connect(user1).requestClaimAssets(amountOfSharesToWithdraw)

      expect(await strategy.requests(user1.address)).equal(amountOfSharesToWithdraw)
      expect(await vault.balanceOf(await strategy.getAddress())).equal(amountOfSharesToWithdraw)
      expect(await strategy.totalRequestedVaultSharesForClaim()).equal(amountOfSharesToWithdraw)
      expect(await strategy.bridgedAssets()).equal(amount1 - vaultBuffer)
      let canBridgeMessage = await strategy.canBridgeClaimRequestMessage()
      expect(canBridgeMessage[0]).equal(false)
      expect(canBridgeMessage[1]).equal(0n)

      await increase(86400)
      canBridgeMessage = await strategy.canBridgeClaimRequestMessage()
      expect(canBridgeMessage[0]).equal(true)
      expect(canBridgeMessage[1]).equal(amountOfSharesToWithdraw)

      await strategy.bridgeMessage()

      expect(await strategy.pendingRequestedBridgingAssets()).equal(amountOfSharesToWithdraw)
      expect(await strategy.bridgedAssets()).equal(amount1 - vaultBuffer - amountOfSharesToWithdraw)

      /// ====== Claim ether by bridge ======

      // Add a claim leaf to rollup exit tree
      const originNetwork = networkIDMainnet;
      const tokenAddress = ZeroAddress; // ether
      const amount = amountOfSharesToWithdraw
      const destinationNetwork = networkIDRollup;
      const destinationAddress = await strategy.getAddress()
      const metadata = "0x"; // since is ether does not have metadata
      const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);
      const mainnetExitRoot = await polygonZkEVMGlobalExitRootL2.lastMainnetExitRoot();

      // compute root merkle tree in Js
      const height = 32;
      const merkleTree = new MerkleTreeBridge(height);
      const leafValue = getLeafValue(
        LEAF_TYPE_ASSET,
        originNetwork,
        tokenAddress,
        destinationNetwork,
        destinationAddress,
        amount,
        metadataHash
      );
      merkleTree.add(leafValue);

      // check merkle root with SC
      const rootJSRollup = merkleTree.getRoot();
      const merkleTreeRollup = new MerkleTreeBridge(height);
      merkleTreeRollup.add(rootJSRollup);
      const rollupRoot = merkleTreeRollup.getRoot();

      // add rollup Merkle root
      await expect(polygonZkEVMGlobalExitRootL2.connect(rollupManager).updateExitRoot(rollupRoot))
        .to.emit(polygonZkEVMGlobalExitRootL2, "UpdateGlobalExitRoot")
        .withArgs(mainnetExitRoot, rollupRoot);

      // check roots
      const rollupExitRootSC = await polygonZkEVMGlobalExitRootL2.lastRollupExitRoot();
      expect(rollupExitRootSC).to.be.equal(rollupRoot);

      const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
      expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRootL2.getLastGlobalExitRoot());
      //
      // check merkle proof
      const index = 0;
      const proofLocal = merkleTree.getProofTreeByIndex(0);
      const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
      const globalIndex = computeGlobalIndex(index, index, false);

      // verify merkle proof
      expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
      expect(
        await polygonZkEVMBridgeContractL2.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)
      ).to.be.equal(true);

      await expect(
        polygonZkEVMBridgeContractL2.claimAsset(
          proofLocal,
          proofRollup,
          globalIndex,
          mainnetExitRoot,
          rollupExitRootSC,
          originNetwork,
          tokenAddress,
          destinationNetwork,
          destinationAddress,
          amount,
          metadata
        )
      )
        .to.emit(polygonZkEVMBridgeContractL2, "ClaimEvent")
        .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount);
      /// ===================================

      await mine(5)

      await strategy.claimRequestedAssets([user1.address])
    })
  })

  describe("Access", function () {
    it("Set destination", async function () {
      const {strategy , enzymeStaker} = await loadFixture(deployBridgeVaultStrategy);
      await expect(strategy.setDestination(await enzymeStaker.getAddress())).to.be.revertedWithCustomError(strategy, 'OnlyGovernanceCanDoThis')
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
