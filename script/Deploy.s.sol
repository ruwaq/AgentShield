// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentShieldRegistry} from "../contracts/AgentShieldRegistry.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        // Testnet platform: 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
        // Mainnet platform: 0x5E5205CF39E766118C01636bED000A54D93163E6
        address platform = vm.envAddress("SOMNIA_AGENTS_PLATFORM");
        // LLM Inference agent ID (confirmed on testnet)
        uint256 agentId = vm.envOr("SOMNIA_LLM_AGENT_ID", uint256(12847293847561029384));

        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);
        AgentShieldRegistry registry = new AgentShieldRegistry(deployer, platform, agentId);
        vm.stopBroadcast();

        console.log("AgentShieldRegistry deployed at:", address(registry));
        console.log("SomniaAgentsPlatform:", platform);
        console.log("LLMAgentId:", agentId);
    }
}

contract CreateDemoPolicyScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registryAddr = vm.envAddress("AGENTSHIELD_REGISTRY");
        address demoTarget = vm.envAddress("DEMO_TARGET");

        vm.startBroadcast(deployerKey);
        AgentShieldRegistry registry = AgentShieldRegistry(payable(registryAddr));
        registry.createPolicy(50 ether);
        registry.setAllowedTarget(1, demoTarget, true);
        vm.stopBroadcast();

        console.log("Demo policy created for target:", demoTarget);
    }
}