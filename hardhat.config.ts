import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-ignore-warnings'
import "@openzeppelin/hardhat-upgrades";
import {getEnv} from "./scripts/getEnv";

const argv = getEnv()

const config: HardhatUserConfig = {
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
