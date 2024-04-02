import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getDeployedContractByName} from "../scripts/deployHelpers";
import {Switcher} from "../typechain-types";

const NAME = 'BridgedStakingStrategy';
const allowedNetworks = ['hardhat', 'cardona', 'zkevm',]

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, bridge, governance } = await getNamedAccounts();

  const switcher = await getDeployedContractByName("Switcher")

  const deployResult = await deploy(NAME, {
    contract: NAME,
    from: deployer,
    args: [switcher, bridge, 0,],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (governance === deployer) {
    const switcherContract = await hre.ethers.getContractAt("Switcher", switcher) as Switcher
    await switcherContract.initStrategy(deployResult.address)
    console.log('Strategy added to Switcher')
  }
}
export default func;
func.tags = [NAME];
func.dependencies = ['Switcher',];
func.skip = async (hre: HardhatRuntimeEnvironment) => !allowedNetworks.includes(hre.network.name)
