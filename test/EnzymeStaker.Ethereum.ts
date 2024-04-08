import {ethers} from "hardhat";
import { config as dotEnvConfig } from 'dotenv';
import { reset } from '@nomicfoundation/hardhat-network-helpers';
import {getEnv} from "../scripts/getEnv";
import {EthAddresses} from "../scripts/EthAddresses";
import {expect} from "chai";
import {EnzymeStaker, PolygonZkEVMBridgeV2__factory} from "../typechain-types";
import {MaxUint256, parseEther, ZeroAddress} from "ethers";
import {increase} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/increase";
import {BridgeHelper} from "./helpers/BridgeHelper";

dotEnvConfig();

describe("Enzyme staker forking test", function () {
  const networkIDMainnet = 0
  const networkIDRollup = 1

  let enzymeStaker: EnzymeStaker

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

  after(async function () {
    await reset()
  });

  it("Stake to Enzyme vault", async function () {
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

    const requestAmount = parseEther("1.0")

    const msg = await BridgeHelper.prepareMessageL1(deployer, await enzymeStaker.getAddress(), requestAmount)

    await expect(enzymeStaker.claimMessage(
      msg.proofLocal,
      msg.proofRollup,
      msg.globalIndex,
      msg.mainnetExitRoot,
      msg.rollupExitRoot,
      msg.metadata,
    )).to.revertedWith('Shares action timelocked')

    await increase(24 * 3600)

    expect(await ethers.provider.getBalance(await enzymeStaker.getAddress())).eq(0n)

    await enzymeStaker.claimMessage(
      msg.proofLocal,
      msg.proofRollup,
      msg.globalIndex,
      msg.mainnetExitRoot,
      msg.rollupExitRoot,
      msg.metadata,
    )

    expect(await ethers.provider.getBalance(await enzymeStaker.getAddress())).eq(0n)

    const bridge = PolygonZkEVMBridgeV2__factory.connect(EthAddresses.POLYGON_ZKEVM_BRIDGE_V2, deployer)
    await expect(enzymeStaker.claimMessage(
      msg.proofLocal,
      msg.proofRollup,
      msg.globalIndex,
      msg.mainnetExitRoot,
      msg.rollupExitRoot,
      msg.metadata,
    )).to.revertedWithCustomError(bridge, "AlreadyClaimed")

    await expect(enzymeStaker.onMessageReceived(ZeroAddress, 0, "0x")).to.revertedWithCustomError(enzymeStaker, "ClaimByThisContractOnly")

  })

  it("Redeem all from Enzyme vault", async function () {
    const [deployer] = await ethers.getSigners();
    const bridgeAsSigner = await ethers.getImpersonatedSigner(EthAddresses.POLYGON_ZKEVM_BRIDGE_V2)
    await bridgeAsSigner.sendTransaction({
      to: await enzymeStaker.getAddress(),
      value: parseEther("1.0"),
    });

    const requestAmount = MaxUint256
    const msg = await BridgeHelper.prepareMessageL1(deployer, await enzymeStaker.getAddress(), requestAmount)
    await increase(24 * 3600)
    await enzymeStaker.claimMessage(
      msg.proofLocal,
      msg.proofRollup,
      msg.globalIndex,
      msg.mainnetExitRoot,
      msg.rollupExitRoot,
      msg.metadata,
    )
    expect(await ethers.provider.getBalance(await enzymeStaker.getAddress())).eq(0n)
  })
})
