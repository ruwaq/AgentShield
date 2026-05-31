# Architecture

The MVP uses one contract, one frontend and no backend. `AgentShieldRegistry.sol` stores policies, performs deterministic checks, calls Somnia LLM Inference, handles callbacks and stores scan results.
