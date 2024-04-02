import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const NAME = 'RewardToken';
const allowedNetworks = ['hardhat', 'cardona', 'zkevm',]

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, governance } = await getNamedAccounts();

  await deploy(NAME, {
    contract: NAME,
    from: deployer,
    args: ["DIVA premint receipt", "preDIVA", governance,],
    log: true,
    skipIfAlreadyDeployed: true,
  });
}
export default func;
func.tags = [NAME];
func.skip = async (hre: HardhatRuntimeEnvironment) => !allowedNetworks.includes(hre.network.name)
