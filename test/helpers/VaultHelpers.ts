import {MockERC20, ZkETH, WETH9} from "../../typechain-types";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

export const depositToVault = async (
  user: HardhatEthersSigner,
  vault: ZkETH,
  weth: WETH9,
  amount: bigint
) => {
  await weth.connect(user).deposit({value: amount})
  await weth.connect(user).approve(await vault.getAddress(), amount)
  await vault.connect(user).deposit(amount, user.address)
}