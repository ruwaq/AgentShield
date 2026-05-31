import { ethers } from "hardhat";
async function main() {
  const registryAddress = process.env.AGENTSHIELD_REGISTRY;
  const target = process.env.DEMO_TARGET;
  if (!registryAddress || !target) throw new Error("Set AGENTSHIELD_REGISTRY and DEMO_TARGET in .env");
  const registry = await ethers.getContractAt("AgentShieldRegistry", registryAddress);
  await (await registry.createPolicy(ethers.parseEther("50"))).wait();
  await (await registry.setAllowedTarget(1, target, true)).wait();
  console.log("Demo policy created and target allowlisted.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
