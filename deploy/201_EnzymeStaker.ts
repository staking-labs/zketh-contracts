import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {ZeroAddress} from "ethers";

const NAME = 'EnzymeStaker';
const allowedNetworks = ['hardhat', 'sepolia', 'ethereum',]

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer,  weth, comptroller, depositWrapper,  bridge, strategyL2,} = await getNamedAccounts();

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

  let strategyL2Address
  if (hre.network.name == 'hardhat') {
    const strategyDeployment = await deployments.get("BridgedStakingStrategy")
    strategyL2Address = strategyDeployment.address
  } else {
    strategyL2Address = strategyL2
  }

  await deploy(NAME, {
    contract: NAME,
    from: deployer,
    args: [bridge, comptrollerAddress, depositWrapperAddress, strategyL2Address, 0, 1, wethAddress],
    log: true,
    skipIfAlreadyDeployed: true,
  });
}
export default func;
func.tags = [NAME];
func.dependencies = [];
func.skip = async (hre: HardhatRuntimeEnvironment) => !allowedNetworks.includes(hre.network.name)
