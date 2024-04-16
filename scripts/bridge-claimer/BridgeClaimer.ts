import axios, {AxiosResponse} from 'axios';
import {ethers} from "hardhat";
import {AbiCoder, formatUnits} from "ethers";
import {SepoliaAddresses} from "../SepoliaAddresses";
import {getEnv} from "../getEnv";
import {PolygonZkEVMBridgeV2__factory, PolygonZkEVMGlobalExitRoot__factory, BridgedStakingStrategy__factory, EnzymeStaker__factory} from "../../typechain-types";
import {CardonaAddresses} from "../CardonaAddresses";

const argv = getEnv()

async function main() {
  console.log('Bridge Claimer testnet')

  const rpcL1 = "https://rpc2.sepolia.org"
  const rpcL2 = "https://rpc.cardona.zkevm-rpc.com"
  const bridgeApiBase = "https://bridge-api.cardona.zkevm-rpc.com/"
  const strategyL1 = SepoliaAddresses.ENZYME_STAKER
  const strategyL2 = CardonaAddresses.STRATEGY

  // call bridge
  const provider = new ethers.JsonRpcProvider(rpcL2)
  const wallet = new ethers.Wallet(argv.privateKey, provider)
  const strategyL2Contract = BridgedStakingStrategy__factory.connect(CardonaAddresses.STRATEGY, wallet)
  const needBridgingResult = await strategyL2Contract.needBridgingNow()
  if (needBridgingResult[0] === true) {
    if (needBridgingResult[1] === false) {
      // request asets from L1
      const txResponse = await strategyL2Contract.callBridge()
      console.log('Request assets for bridging. Message from L2 to L1.')
      process.stdout.write(`Tx ${txResponse.hash}.. `)
      await txResponse.wait()
      console.log(`confirmed.`)
    } else {
      // bridge asets to L1
      const txResponse = await strategyL2Contract.callBridge()
      console.log('Calling bridge for bridging assets from L2 to L1')
      process.stdout.write(`Tx ${txResponse.hash}.. `)
      await txResponse.wait()
      console.log(`confirmed.`)
    }
  }

  // claim bridge assets and messages on L2
  const rL2 = await axios.get(`${bridgeApiBase}bridges/${strategyL2}`)
  if (rL2.status !== 200) {
    throw new Error(`Bridge API status: ${rL2?.statusText}`)
  }


  console.log(rL2.data)



  // claim bridge assets and messages on L1
  const r = await axios.get(`${bridgeApiBase}bridges/${strategyL1}`)
  if (r.status !== 200) {
    throw new Error(`Bridge API status: ${r?.statusText}`)
  }

  if (r.data.deposits && r.data.deposits.length > 0) {
    for (const deposit of r.data.deposits) {
      if (!deposit.claim_tx_hash) {
        const isMessage = deposit.leaf_type == 1
        const isToL1FromL2 = deposit.network_id == 1 && deposit.dest_net == 0
        console.log(`Found unclaimed ${isMessage ? 'message' : 'asset'} from ${isToL1FromL2 ? 'L2 to L1' : 'L1 to L2' }.`)
        if (!isMessage && isToL1FromL2) {
          console.log(`Amount of ETH to bridge: ${deposit.amount}.`)
          await claimAssetOnL1(
            rpcL1,
            bridgeApiBase,
            SepoliaAddresses.POLYGON_ZKEVM_BRIDGE_V2,
            SepoliaAddresses.ENZYME_STAKER,
            deposit.amount,
            deposit.global_index,
            deposit.deposit_cnt
          )
        } else if (isMessage && isToL1FromL2) {
          const decodedInput = (new AbiCoder).decode(
            ['uint256',],
            deposit.metadata
          )
          console.log(`Amount of ETH to request: ${formatUnits('' + decodedInput)}.`)
          await claimMessageOnL1(
            rpcL1,
            bridgeApiBase,
            SepoliaAddresses.POLYGON_ZKEVM_BRIDGE_V2,
            SepoliaAddresses.ENZYME_STAKER,
            deposit.metadata,
            deposit.global_index,
            deposit.deposit_cnt
          )
        } else {
          throw new Error("not implemented")
        }


      }
    }
  }

  //

}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function claimAssetOnL1(
  rpcL1: string,
  bridgeApiBase: string,
  bridgeL1: string,
  strategyL1: string,
  amount: bigint,
  globalIndex: number,
  deposit_cnt: number,
) {
  const provider = new ethers.JsonRpcProvider(rpcL1)
  const wallet = new ethers.Wallet(argv.privateKey, provider)
  const polygonZkEVMBridgeContractL1 = PolygonZkEVMBridgeV2__factory.connect(bridgeL1, wallet)

  let r: AxiosResponse | undefined
  try {
    r = await axios.get(`${bridgeApiBase}merkle-proof?deposit_cnt=${deposit_cnt}&net_id=1`)
  } catch (e: any) {
    console.log(`API failed. Status: ${e.response?.status}. Message: ${e.response.data.message}.`)
  }

  if (r) {
    const metadata = "0x";
    const proofLocal = r.data.proof.merkle_proof;
    const proofRollup = r.data.proof.rollup_merkle_proof;
    const mainnetExitRoot = r.data.proof.main_exit_root
    const rollupExitRoot = r.data.proof.rollup_exit_root

    // console.log('proofLocal', proofLocal)
    // console.log('proofRollup', proofRollup)
    // console.log('globalIndex', globalIndex)
    // console.log('mainnetExitRoot', mainnetExitRoot)
    // console.log('rollupExitRoot', rollupExitRoot)

    await polygonZkEVMBridgeContractL1.claimAsset.staticCall(
      proofLocal,
      proofRollup,
      globalIndex,
      mainnetExitRoot,
      rollupExitRoot,
      0,
      ethers.ZeroAddress,
      0,
      strategyL1,
      amount,
      metadata
    )

    console.log('StaticCall done')

    const txResponse = await polygonZkEVMBridgeContractL1.claimAsset(
      proofLocal,
      proofRollup,
      globalIndex,
      mainnetExitRoot,
      rollupExitRoot,
      0,
      ethers.ZeroAddress,
      0,
      strategyL1,
      amount,
      metadata
    )

    process.stdout.write(`Tx ${txResponse.hash}.. `)
    await txResponse.wait()
    console.log(`confirmed.`)

  }


}
async function claimMessageOnL1(
  rpcL1: string,
  bridgeApiBase: string,
  bridgeL1: string,
  strategyL1: string,
  metadata: string,
  globalIndex: number,
  deposit_cnt: number,
) {
  const provider = new ethers.JsonRpcProvider(rpcL1)
  const wallet = new ethers.Wallet(argv.privateKey, provider)
  // const polygonZkEVMBridgeContractL1 = PolygonZkEVMBridgeV2__factory.connect(bridgeL1, wallet)
  const strategy = EnzymeStaker__factory.connect(strategyL1, wallet)

  let r: AxiosResponse | undefined
  try {
    r = await axios.get(`${bridgeApiBase}merkle-proof?deposit_cnt=${deposit_cnt}&net_id=1`)
  } catch (e: any) {
    console.log(`API failed. Status: ${e.response?.status}. Message: ${e.response.data.message}.`)
  }

  if (r) {
    // console.log('r', r)
    // const metadata = "0x";
    const proofLocal = r.data.proof.merkle_proof;
    const proofRollup = r.data.proof.rollup_merkle_proof;
    const mainnetExitRoot = r.data.proof.main_exit_root
    const rollupExitRoot = r.data.proof.rollup_exit_root

    // console.log('proofLocal', proofLocal)
    // console.log('proofRollup', proofRollup)
    // console.log('globalIndex', globalIndex)
    // console.log('mainnetExitRoot', mainnetExitRoot)
    // console.log('rollupExitRoot', rollupExitRoot)

    await strategy.claimMessage.staticCall(
      proofLocal,
      proofRollup,
      globalIndex,
      mainnetExitRoot,
      rollupExitRoot,
      metadata
    )

    console.log('StaticCall done')

    const txResponse = await strategy.claimMessage(
      proofLocal,
      proofRollup,
      globalIndex,
      mainnetExitRoot,
      rollupExitRoot,
      metadata
    )

    process.stdout.write(`Tx ${txResponse.hash}.. `)
    await txResponse.wait()
    console.log(`confirmed.`)

  }

}