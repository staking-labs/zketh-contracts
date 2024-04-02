import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getDeployedContractByName} from "../scripts/deployHelpers";

const NAME = 'Gauge';
const allowedNetworks = ['hardhat', 'cardona', 'zkevm',]

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, governance } = await getNamedAccounts();

  const duration = 86400n * 7n
  const rewardToken = await getDeployedContractByName("RewardToken")

  await deploy(NAME, {
    contract: NAME,
    from: deployer,
    args: [rewardToken, duration, governance,],
    log: true,
    skipIfAlreadyDeployed: true,
  });
}
export default func;
func.tags = [NAME];
func.dependencies = ['RewardToken',];
func.skip = async (hre: HardhatRuntimeEnvironment) => !allowedNetworks.includes(hre.network.name)
