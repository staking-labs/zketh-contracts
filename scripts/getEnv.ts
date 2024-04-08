import { config as dotEnvConfig } from 'dotenv';


export function getEnv() {
  dotEnvConfig();

  return require('yargs/yargs')()
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
      ethRpcUrl: {
        type: 'string',
      },
      ethForkBlock: {
        type: 'number',
        default: 19482432,
      },
      privateKey: {
        type: 'string',
        default: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // default account 0
      },
    }).argv;
}
