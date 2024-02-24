import {MockERC20, ZkETH} from "../../typechain-types";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

export const depositToVault = async (
  user: HardhatEthersSigner,
  vault: ZkETH,
  mockToken: MockERC20,
  amount: bigint
) => {
  await mockToken.connect(user).mint(amount)
  await mockToken.connect(user).approve(await vault.getAddress(), amount)
  await vault.connect(user).deposit(amount, user.address)
}