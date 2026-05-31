// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AegisBrain} from "../contracts/aegis/AegisBrain.sol";
import {AegisCreate} from "../contracts/aegis/AegisCreate.sol";
import {AegisListen} from "../contracts/aegis/AegisListen.sol";

/// @title DeployAegis — Deploy script para el framework AEGIS completo
/// @notice Despliega los 3 contratos del core en Somnia testnet/mainnet.
/// @dev Usa variables de entorno:
///      SOMNIA_AGENTS_PLATFORM — dirección de la plataforma de agentes
///      LLM_AGENT_ID — ID del agente LLM (default: 12847293847561029384)
///      PRIVATE_KEY — clave privada del deployer
contract DeployAegisScript is Script {
    // Constantes verificadas on-chain (2026-05-29)
    address constant PLATFORM_TESTNET = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    address constant PLATFORM_MAINNET = 0x5E5205CF39E766118C01636bED000A54D93163E6;
    uint256 constant LLM_AGENT_ID = 12847293847561029384;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address platform = vm.envOr("SOMNIA_AGENTS_PLATFORM", PLATFORM_TESTNET);
        uint256 agentId = vm.envOr("LLM_AGENT_ID", LLM_AGENT_ID);

        vm.startBroadcast(deployerKey);

        // 1. Deploy AegisBrain (base)
        AegisBrain brain = new AegisBrain(platform, agentId);
        console.log("AegisBrain deployed at:", address(brain));

        // 2. Deploy AegisCreate (NFT guardianes)
        AegisCreate create = new AegisCreate(platform, agentId);
        console.log("AegisCreate deployed at:", address(create));

        // 3. Deploy AegisListen (reactividad)
        AegisListen listen = new AegisListen(platform, agentId);
        console.log("AegisListen deployed at:", address(listen));

        vm.stopBroadcast();

        console.log("\n=== AEGIS Framework Deployed ===");
        console.log("Brain: ", address(brain));
        console.log("Create:", address(create));
        console.log("Listen:", address(listen));
        console.log("Platform:", platform);
        console.log("LLM Agent ID:", agentId);
    }
}

/// @title DeployAegisCombined — Un solo contrato para todo (hereda Brain+Create+Listen)
/// @notice Alternativa: desplegar AegisListen que ya hereda de AegisBrain,
///         y AegisCreate separado para NFTs.
contract DeployAegisCombinedScript is Script {
    address constant PLATFORM_TESTNET = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    uint256 constant LLM_AGENT_ID = 12847293847561029384;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address platform = vm.envOr("SOMNIA_AGENTS_PLATFORM", PLATFORM_TESTNET);
        uint256 agentId = vm.envOr("LLM_AGENT_ID", LLM_AGENT_ID);

        vm.startBroadcast(deployerKey);

        // AegisListen hereda de AegisBrain → tiene todas las capacidades
        AegisListen aegis = new AegisListen(platform, agentId);
        console.log("AEGIS (combined) deployed at:", address(aegis));

        vm.stopBroadcast();

        console.log("\n=== AEGIS Combined Deployed ===");
        console.log("Address:", address(aegis));
        console.log("Platform:", platform);
        console.log("LLM Agent ID:", agentId);
        console.log("\nThis contract has: thinkPipeline, multiThink, thinkWithTools, on, handleEvent");
    }
}