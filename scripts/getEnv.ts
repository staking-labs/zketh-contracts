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
      },
    }).argv;
}
