import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getDeployedContractByName} from "../scripts/deployHelpers";
import {ZeroAddress} from "ethers";

const NAME = 'ZkETH';
const allowedNetworks = ['hardhat', 'cardona', 'zkevm',]

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer,  weth } = await getNamedAccounts();

  const switcher = await getDeployedContractByName("Switcher")
  const gauge = await getDeployedContractByName("Gauge")

  let wethAddress
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

  await deploy(NAME, {
    contract: NAME,
    from: deployer,
    args: [wethAddress, switcher, gauge,],
    log: true,
    skipIfAlreadyDeployed: true,
  });
}
export default func;
func.tags = [NAME];
func.dependencies = ['Switcher', 'Gauge',];
func.skip = async (hre: HardhatRuntimeEnvironment) => !allowedNetworks.includes(hre.network.name)
