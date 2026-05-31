import { ethers } from "hardhat";
const EXPECTED_CHAIN_ID = 50312n;
async function main() {
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) throw new Error(`Wrong chainId. Expected ${EXPECTED_CHAIN_ID}`);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer. Check PRIVATE_KEY.");
  const balance = await provider.getBalance(deployer.address);
  console.log("wallet:", deployer.address, "balance:", ethers.formatEther(balance), "STT");
  if (balance === 0n) throw new Error("Wallet has zero STT.");
  const platform = process.env.SOMNIA_AGENTS_PLATFORM;
  if (!platform) throw new Error("Missing SOMNIA_AGENTS_PLATFORM.");
  const code = await provider.getCode(platform);
  if (code === "0x") throw new Error("No bytecode at SOMNIA_AGENTS_PLATFORM.");
  console.log("Preflight OK.");
}
main().catch((error) => { console.error("Preflight failed:", error); process.exitCode = 1; });
