const REVERT_IF_NOT_FOUND = false;

// tslint:disable-next-line:no-var-requires
const hreLocal = require('hardhat');

export async function getDeployedContractByName(name: string, revertIfNotFound = REVERT_IF_NOT_FOUND): Promise<string> {
  const { deployments } = hreLocal;
  let contract;
  try {
    contract = await deployments.get(name);
  } catch (e) {
  }
  if (!contract && revertIfNotFound) {
    throw new Error(`Contract ${name} not deployed`);
  }
  return contract?.address ?? '';
}
