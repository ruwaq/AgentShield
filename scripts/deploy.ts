import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const platform = process.env.SOMNIA_AGENTS_PLATFORM;
  const llmAgentId = process.env.SOMNIA_LLM_AGENT_ID || "12847293847561029384";
  if (!platform) throw new Error("Missing SOMNIA_AGENTS_PLATFORM");
  const Registry = await ethers.getContractFactory("AgentShieldRegistry");
  const registry = await Registry.deploy(deployer.address, platform, llmAgentId);
  await registry.waitForDeployment();
  console.log("AgentShieldRegistry=", await registry.getAddress());
  console.log("SomniaAgentsPlatform=", platform);
  console.log("LLMAgentId=", llmAgentId);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
