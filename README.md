# zkETH

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

## Ethereum contracts

### EnzymeStaker

Depositing, withdrawing from Enzyme Diva ETH vault, pre-minted rewards snapshot message sending to zkEVM.

## Off-chain infrastructure

Any address can write to contracts to perform pending inter-blockchain interactions. Interactions will only be successful if the merkle tree of it is successfully verified by LxLy bridge contract.
Accordingly, this can be automated through Chainlink, Gelato Web3Functions, own script running on a server or manually by users through UI.
