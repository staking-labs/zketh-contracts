import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-ignore-warnings'
import "@openzeppelin/hardhat-upgrades";
import {config as dotEnvConfig} from "dotenv";

dotEnvConfig();
const argv = require('yargs/yargs')()
  .env('')
  .options({
    hardhatChainId: {
      type: "number",
      default: 31337
    },
    loggingEnabled: {
      type: "boolean",
      default: false
    },
  }).argv;

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
