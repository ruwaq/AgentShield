// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentShieldRegistry} from "../contracts/AgentShieldRegistry.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address platform = vm.envAddress("SOMNIA_AGENTS_PLATFORM");
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