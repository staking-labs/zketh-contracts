import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getDeployedContractByName} from "../scripts/deployHelpers";
import {ZeroAddress} from "ethers";

const NAME = 'EnzymeStaker';
const allowedNetworks = ['hardhat', 'sepolia', 'ethereum',]

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer,  weth, comptroller, depositWrapper,  bridge,} = await getNamedAccounts();

  const switcher = await getDeployedContractByName("Switcher")
  const gauge = await getDeployedContractByName("Gauge")

  let wethAddress
  let comptrollerAddress
  let depositWrapperAddress

  if (weth === ZeroAddress) {
    const deployResult = await deploy("WETH9", {
      contract: "WETH9",
      from: deployer,
      log: true,
    })
    wethAddress = deployResult.address
  } else {
    wethAddress = weth
  }

  if (comptroller === ZeroAddress) {
    const deployResult = await deploy("MockComptroller", {
      contract: "MockComptroller",
      from: deployer,
      log: true,
      args: [wethAddress,]
    })
    comptrollerAddress = deployResult.address
  } else {
    comptrollerAddress = comptroller
  }

  if (depositWrapper === ZeroAddress) {
    const deployResult = await deploy("MockDepositWrapper", {
      contract: "MockDepositWrapper",
      from: deployer,
      log: true,
      args: [comptrollerAddress, wethAddress,]
    })
    depositWrapperAddress = deployResult.address
  } else {
    depositWrapperAddress = depositWrapper
  }

  let strategyL2
  if (hre.network.name == 'hardhat') {
    const strategyDeployment = await deployments.get("BridgedStakingStrategy")
    strategyL2 = strategyDeployment.address
  } else {
    throw new Error(`Add strategy L2 address for network ${hre.network.name}`)
  }

  await deploy(NAME, {
    contract: NAME,
    from: deployer,
    args: [bridge, comptrollerAddress, depositWrapperAddress, strategyL2, 0, 1, wethAddress],
    log: true,
    skipIfAlreadyDeployed: true,
  });
}
export default func;
func.tags = [NAME];
func.dependencies = [];
func.skip = async (hre: HardhatRuntimeEnvironment) => !allowedNetworks.includes(hre.network.name)
