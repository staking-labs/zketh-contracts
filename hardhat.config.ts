import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-ignore-warnings'
import "@openzeppelin/hardhat-upgrades";
import {getEnv} from "./scripts/getEnv";
import 'hardhat-deploy';
import {ZeroAddress} from "ethers";
import {SepoliaAddresses} from "./scripts/SepoliaAddresses";
import {CardonaAddresses} from "./scripts/CardonaAddresses";
import {EthAddresses} from "./scripts/EthAddresses";
import {ZkEVMAddresses} from "./scripts/ZkEVMAddresses";

const argv = getEnv()

const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: 0,
    governance: {
      hardhat: 0,
    },
    weth: {
      hardhat: ZeroAddress,
      cardona: ZeroAddress,
      sepolia: ZeroAddress,
      zkevm: ZkEVMAddresses.WETH,
      ethereum: EthAddresses.WETH,
    },
    bridge: {
      hardhat: ZeroAddress,
      cardona: CardonaAddresses.POLYGON_ZKEVM_BRIDGE_V2,
      sepolia: SepoliaAddresses.POLYGON_ZKEVM_BRIDGE_V2,
      zkevm: ZkEVMAddresses.POLYGON_ZKEVM_BRIDGE_V2,
      ethereum: EthAddresses.POLYGON_ZKEVM_BRIDGE_V2,
    },
    comptroller: {
      hardhat: ZeroAddress,
      sepolia: ZeroAddress,
      ethereum: EthAddresses.ENZYME_COMPTROLLER_PROXY,
    },
    depositWrapper: {
      hardhat: ZeroAddress,
      sepolia: ZeroAddress,
      ethereum: EthAddresses.ENZYME_DEPOSIT_WRAPPER,
    },
  },
  networks: {
    hardhat: {
      loggingEnabled: argv.loggingEnabled,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          // "evmVersion": "istanbul",
          optimizer: {
            enabled: true,
            runs: 150,
          }
        }
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 150,
          }
        },
      },
    ],
  },
  warnings: {
    '@0xpolygonhermez/zkevm-contracts/contracts/**/*': {
      default: 'off',
    },
  },
};

export default config;
