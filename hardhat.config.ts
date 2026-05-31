import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const config: HardhatUserConfig = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } },
  networks: { somniaTestnet: { url: process.env.SOMNIA_TESTNET_RPC || "https://api.infra.testnet.somnia.network/", chainId: 50312, accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [] } }
};
export default config;
