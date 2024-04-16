# zkETH

## Deployments

### Cardona testnet

* zkETH 0x589A504F2Ee9D054b483c700FA814863D639381e
* Switcher 0xc184a3ECcA684F2621c903A7943D85fA42F56671
* BridgedStakingStrategy 0xd4D6ad656f64E8644AFa18e7CCc9372E0Cd256f0
* RewardToken 0xee7751bF946Da4cbb39A76fd8dD99a8872871a7F
* Gauge 0x25Ce4dec89652E17a0e5acF447A64dcB781E0FD8
* WETH 0x75954965331D7b9a6fdd2DC024512b8F36DA4Dbc

### Sepolia testnet

* EnzymeStaker 0x0c08C388E9B1De17195A7E31BCbd1FC4657fb4D2
* WETH 0xdb998e95a22fe1Ee74eF1F5CDD7FCA151456a04E
* MockController 0x4Aca671A420eEB58ecafE83700686a2AD06b20D8
* MockDepositWrappr 0x33222Ee7eAb1aBE6fC1724eAce207fA3Fa62C7C3

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

## Manual tests

### Cardona <-> Sepolia

```shell
# Set BridgedStakingStrategy destination
cast send --rpc-url https://rpc.cardona.zkevm-rpc.com -i --legacy 0xd4D6ad656f64E8644AFa18e7CCc9372E0Cd256f0 "setDestination(address)" 0x0c08C388E9B1De17195A7E31BCbd1FC4657fb4D2
# Wrap ETH
cast send --rpc-url https://rpc.cardona.zkevm-rpc.com -i --legacy 0x75954965331D7b9a6fdd2DC024512b8F36DA4Dbc "deposit(uint)" 10.02ether --value 10.02ether
# Approve WETH
cast send --rpc-url https://rpc.cardona.zkevm-rpc.com -i --legacy 0x75954965331D7b9a6fdd2DC024512b8F36DA4Dbc "approve(address,uint)(bool)" 0x589A504F2Ee9D054b483c700FA814863D639381e 100ether
# Mint zkETH
cast send --rpc-url https://rpc.cardona.zkevm-rpc.com -i --legacy 0x589A504F2Ee9D054b483c700FA814863D639381e "mint(uint,address)(uint)" 10.02ether 0x3d0c177E035C30bb8681e5859EB98d114b48b935

# Check needBridgingNow
cast call --rpc-url https://rpc.cardona.zkevm-rpc.com 0xd4D6ad656f64E8644AFa18e7CCc9372E0Cd256f0 "needBridgingNow()(bool,bool,uint)"
# Call bridge
cast send --rpc-url https://rpc.cardona.zkevm-rpc.com -i --legacy 0x3C888C84511f4C0a4F3Ea5eD1a16ad7F6514077e "callBridge()"

# Check user shares balance
cast call --rpc-url https://rpc.cardona.zkevm-rpc.com 0x589A504F2Ee9D054b483c700FA814863D639381e "balanceOf(address)(uint)" 0x3d0c177E035C30bb8681e5859EB98d114b48b935
# requestClaimAssets
cast send --rpc-url https://rpc.cardona.zkevm-rpc.com -i --legacy 0x589A504F2Ee9D054b483c700FA814863D639381e "approve(address,uint)(bool)" 0xd4D6ad656f64E8644AFa18e7CCc9372E0Cd256f0 100ether
cast send --rpc-url https://rpc.cardona.zkevm-rpc.com -i --legacy 0xd4D6ad656f64E8644AFa18e7CCc9372E0Cd256f0 "requestClaimAssets(uint)" 10.0001ether
```
