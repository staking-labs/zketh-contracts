# zkETH

## Deployments

### Cardona testnet

* zkETH 0xEB529553Bc75377d8A47F2367881D4e854a560e7
* Switcher 0xb58De97355fb3cFF58db07b3dd5b7dd3e8898425
* BridgedStakingStrategy 0x3C888C84511f4C0a4F3Ea5eD1a16ad7F6514077e
* RewardToken 0xE3f1d1B8ea9721FF0399cF6c2990A4bE5e4fc023
* Gauge 0xE0D142466d1BF88FE23D5D265d76068077E4D6F0
* WETH 0x02Af36760deDf3a2ac3Fa7f5af072b9aDaf3F504

### Sepolia testnet

* EnzymeStaker 0x3C888C84511f4C0a4F3Ea5eD1a16ad7F6514077e
* WETH 0xE0D142466d1BF88FE23D5D265d76068077E4D6F0

## zkEVM contracts

### ZkETH

zkETH - ERC-4626 vault on zkEVM network used for staking ETH into Enzyme Diva vault on mainnet, and into future Diva Staking contract on mainnet. This is transferable receipt token given to depositors.

### Switcher

Contract for managing vault's investment strategy.

### BridgedStakingStrategy

Contract for bridging assets and messages between zkEVM and Ethereum via LxLy bridge.

- ETH bridging to mainnet
- Request for withdrawal of ETH from mainnet
- Receiving mainnet staker contract balance and rewards snapshot
- ETH buffer on balance

### Gauge

Contract for the calculation of pre-minted DIVA tokens for sdivETH holders. Based on StakelessMultiPoolBase and MultiGauge contracts with adoption for virtual pre-minted tokens.

### RewardToken

Token for rewarding via gauge.

## Ethereum contracts

### EnzymeStaker

Depositing, withdrawing from Enzyme Diva ETH vault, pre-minted rewards snapshot message sending to zkEVM.

## Off-chain infrastructure

Any address can write to contracts to perform pending inter-blockchain interactions. Interactions will only be successful if the merkle tree of it is successfully verified by LxLy bridge contract.
Accordingly, this can be automated through Chainlink, Gelato Web3Functions, own script running on a server or manually by users through UI.
