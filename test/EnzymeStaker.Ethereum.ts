import {ethers, upgrades} from "hardhat";
import { config as dotEnvConfig } from 'dotenv';
import { reset } from '@nomicfoundation/hardhat-network-helpers';
import {getEnv} from "../scripts/getEnv";
import {EthAddresses} from "../scripts/EthAddresses";
import {expect} from "chai";
import {EnzymeStaker, PolygonZkEVMBridgeV2__factory, PolygonZkEVMGlobalExitRootV2__factory} from "../typechain-types";
import {parseEther, solidityPacked, ZeroAddress} from "ethers";
// @ts-ignore
import {MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
// import {ErrorDecoder} from "ethers-decode-error";
import {increase} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/increase";
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

dotEnvConfig();

const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
  if (isMainnet) {
    return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
  } else {
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
  }
}

describe("Enzyme staker forking test", function () {
  upgrades.silenceWarnings();

  const LEAF_TYPE_MESSAGE = 1;
  const networkIDMainnet = 0
  const networkIDRollup = 1

  let enzymeStaker: EnzymeStaker

  before(async function () {

  });

  beforeEach(async function () {
    const env = getEnv()
    await reset(
      env.ethRpcUrl,
      env.ethForkBlock
    );

    const [deployer] = await ethers.getSigners();
    enzymeStaker = await (await ethers.getContractFactory("EnzymeStaker")).deploy(
      EthAddresses.POLYGON_ZKEVM_BRIDGE_V2,
      EthAddresses.ENZYME_COMPTROLLER_PROXY,
      EthAddresses.ENZYME_DEPOSIT_WRAPPER,
      deployer.address,
      networkIDMainnet,
      networkIDRollup,
      EthAddresses.WETH
    )
  });

  afterEach(async function () {

  });

  after(async function () {
    await reset()
  });

  it("Stake to Enzyme vault", async function () {
    // const [deployer] = await ethers.getSigners();
    const bridgeAsSigner = await ethers.getImpersonatedSigner(EthAddresses.POLYGON_ZKEVM_BRIDGE_V2)
    await bridgeAsSigner.sendTransaction({
      to: await enzymeStaker.getAddress(),
      value: parseEther("1.0"),
    });
  })

  it("Redeem from Enzyme vault", async function () {
    const [deployer] = await ethers.getSigners();
    const bridgeAsSigner = await ethers.getImpersonatedSigner(EthAddresses.POLYGON_ZKEVM_BRIDGE_V2)
    await bridgeAsSigner.sendTransaction({
      to: await enzymeStaker.getAddress(),
      value: parseEther("1.0"),
    });

    const metadata = solidityPacked(["uint256",], [parseEther("1.0")])
    const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

    // compute root merkle tree in Js
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    const leafValue = getLeafValue(
      LEAF_TYPE_MESSAGE,
      networkIDRollup,
      deployer.address,
      networkIDMainnet,
      await enzymeStaker.getAddress(),
      0n,
      metadataHash
    );
    merkleTree.add(leafValue);

    // check merkle root with SC
    const rootJSRollup = merkleTree.getRoot();
    const merkleTreeRollup = new MerkleTreeBridge(height);
    for (let i = 0; i < 10000; i++) {
      merkleTreeRollup.add(rootJSRollup);
    }
    const rollupRoot = merkleTreeRollup.getRoot();

    const bridge = PolygonZkEVMBridgeV2__factory.connect(EthAddresses.POLYGON_ZKEVM_BRIDGE_V2, deployer)
    const polygonZkEVMGlobalExitRootV2 = PolygonZkEVMGlobalExitRootV2__factory.connect(EthAddresses.POLYGON_ZKEVM_GLOBAL_EXIT_ROOT_V2, deployer)
    const rollupManager = await ethers.getImpersonatedSigner(await polygonZkEVMGlobalExitRootV2.rollupManager())

    // add rollup Merkle root
    await ethers.provider.send("hardhat_setBalance", [
      rollupManager.address,
      "0x10000000000000000000000",
    ]);
    await polygonZkEVMGlobalExitRootV2.connect(rollupManager).updateExitRoot(rollupRoot)
    expect(await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot()).eq(rollupRoot)

    const mainnetExitRoot = await polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot();

    const index = 0;
    const indexRollup = 1000;
    const proofLocal = merkleTree.getProofTreeByIndex(index);
    const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);
    const globalIndex = computeGlobalIndex(index, indexRollup, false);

    // verify merkle proof
    expect(false).to.be.equal(await bridge.isClaimed(index, indexRollup));
    expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
    expect(await bridge.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
    expect(await bridge.verifyMerkleProof(rootJSRollup, proofRollup, indexRollup, rollupRoot)).to.be.equal(true);

    // const errorDecoder = ErrorDecoder.create([bridge.interface])
    /*try {
      await bridge.claimMessage(
        proofLocal,
        proofRollup,
        globalIndex,
        mainnetExitRoot,
        await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
        networkIDRollup,
        deployer.address,
        networkIDMainnet,
        await enzymeStaker.getAddress(),
        0n,
        metadata
      )
    } catch (e) {
      const { name } = await errorDecoder.decode(e)
      console.log(name)
    }*/

    await expect(enzymeStaker.claimMessage(
      proofLocal,
      proofRollup,
      globalIndex,
      mainnetExitRoot,
      await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
      metadata,
    )).to.revertedWith('Shares action timelocked')

    await increase(24 * 3600)

    expect(await ethers.provider.getBalance(await enzymeStaker.getAddress())).eq(0n)

    await enzymeStaker.claimMessage(
      proofLocal,
      proofRollup,
      globalIndex,
      mainnetExitRoot,
      await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
      metadata,
    )

    expect(await ethers.provider.getBalance(await enzymeStaker.getAddress())).eq(0n)

    await expect(enzymeStaker.claimMessage(
      proofLocal,
      proofRollup,
      globalIndex,
      mainnetExitRoot,
      await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
      metadata,
    )).to.revertedWithCustomError(bridge, "AlreadyClaimed")

    await expect(enzymeStaker.onMessageReceived(ZeroAddress, 0, "0x")).to.revertedWithCustomError(enzymeStaker, "ClaimByThisContractOnly")

  })
})
