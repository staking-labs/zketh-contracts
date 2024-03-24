import {solidityPacked} from "ethers";
import {ethers} from "hardhat";
import {expect} from "chai";
// @ts-ignore
import {MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {EthAddresses} from "../../scripts/EthAddresses";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;
import {PolygonZkEVMBridgeV2__factory, PolygonZkEVMGlobalExitRootV2__factory} from "../../typechain-types";

export class BridgeHelper {
  static _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;
  static LEAF_TYPE_MESSAGE = 1;
  static networkIDMainnet = 0
  static networkIDRollup = 1

  static async prepareMessage(
    signer: HardhatEthersSigner,
    receiverAddress: string,
    amount: bigint
  ): Promise<{
    proofLocal: any,
    proofRollup: any,
    globalIndex: bigint,
    mainnetExitRoot: string,
    rollupExitRoot: string,
    metadata: string,
  }> {
    const metadata = solidityPacked(["uint256",], [amount])
    const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

    // compute root merkle tree in Js
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    const leafValue = getLeafValue(
      this.LEAF_TYPE_MESSAGE,
      this.networkIDRollup,
      signer.address,
      this.networkIDMainnet,
      receiverAddress,
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

    const bridge = PolygonZkEVMBridgeV2__factory.connect(EthAddresses.POLYGON_ZKEVM_BRIDGE_V2, signer)
    const polygonZkEVMGlobalExitRootV2 = PolygonZkEVMGlobalExitRootV2__factory.connect(EthAddresses.POLYGON_ZKEVM_GLOBAL_EXIT_ROOT_V2, signer)
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
    const globalIndex = this.computeGlobalIndex(index, indexRollup, false);

    // verify merkle proof
    expect(false).to.be.equal(await bridge.isClaimed(index, indexRollup));
    expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
    expect(await bridge.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
    expect(await bridge.verifyMerkleProof(rootJSRollup, proofRollup, indexRollup, rollupRoot)).to.be.equal(true);

    return {
      proofLocal,
      proofRollup,
      metadata,
      mainnetExitRoot,
      rollupExitRoot: await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot(),
      globalIndex,
    }
  }

  static computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
    if (isMainnet) {
      return BigInt(indexLocal) + this._GLOBAL_INDEX_MAINNET_FLAG;
    } else {
      return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
    }
  }
}
