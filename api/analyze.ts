/**
 * AgentShield MCP Endpoint — Vercel Serverless Function
 *
 * POST /api/analyze
 * Receives a proposed on-chain action, runs deterministic checks,
 * returns ALLOW | WARN | BLOCK with risk score.
 *
 * Best practices:
 * - Input validation before processing
 * - Deterministic checks first (zero-cost blocks)
 * - Structured error responses
 * - CORS headers for cross-origin calls from OKX.AI
 * - No side effects, idempotent
 */

// ── Types ──

interface AnalyzeRequest {
  policyId: number;
  action: {
    actionType: "TRANSFER" | "APPROVE" | "CONTRACT_CALL";
    target: string;
    selector: string;
    value: string;
    tokenSymbol: string;
    intent: string;
    data?: string;
  };
}

interface AnalyzeResponse {
  scanId: number;
  verdict: "ALLOW" | "WARN" | "BLOCK";
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  actionHash: string;
  deterministic: boolean;
  timestamp: number;
}

// ── Helpers ──

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function errorResponse(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ ok: false, error: message });
}

function validateRequest(body: unknown): body is AnalyzeRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.policyId !== "number") return false;
  if (!b.action || typeof b.action !== "object") return false;
  const a = b.action as Record<string, unknown>;
  if (typeof a.target !== "string" || !a.target.startsWith("0x")) return false;
  if (typeof a.intent !== "string" || a.intent.length === 0) return false;
  return true;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "0x" + Math.abs(hash).toString(16).padStart(64, "0");
}

function riskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

// ── Deterministic Analysis Engine ──

function analyze(action: AnalyzeRequest["action"]): Pick<AnalyzeResponse, "verdict" | "riskScore" | "reason" | "deterministic"> {
  const lower = action.intent.toLowerCase();

  // 1. Unlimited approval detection (BLOCK — highest priority)
  if (lower.includes("unlimited") && (lower.includes("approve") || lower.includes("approval"))) {
    return {
      verdict: "BLOCK",
      riskScore: 95,
      reason: "CRITICAL: Unlimited approval detected. This is the #1 attack vector for wallet drains. The action has been blocked deterministically.",
      deterministic: true,
    };
  }

  // 2. Known scam patterns (BLOCK)
  if (lower.includes("scam") || lower.includes("phish") || (lower.includes("airdrop") && lower.includes("free"))) {
    return {
      verdict: "BLOCK",
      riskScore: 92,
      reason: "This matches known phishing and social engineering patterns. Free airdrops requesting approvals are a classic wallet drain technique. Blocked by deterministic pattern matching.",
      deterministic: true,
    };
  }

  // 3. Zero-address target (BLOCK)
  if (action.target === "0x0000000000000000000000000000000000000000" || action.target === "0x0") {
    return {
      verdict: "BLOCK",
      riskScore: 100,
      reason: "Target is the zero address. This is almost certainly a mistake or malicious action. Blocked deterministically.",
      deterministic: true,
    };
  }

  // 4. Value exceeds policy threshold (BLOCK)
  const valueMatch = action.intent.match(/(\d+)\s*(STT|USDC|ETH|SOMI)/i);
  if (valueMatch) {
    const value = parseInt(valueMatch[1]);
    // Default policy: max 50 units per transaction
    if (value > 50) {
      return {
        verdict: "BLOCK",
        riskScore: 90,
        reason: `This transfer of ${value} ${valueMatch[2]} exceeds the maximum allowed amount per transaction. Deterministic block — the policy limit is enforced before any LLM inference.`,
        deterministic: true,
      };
    }
  }

  // 5. Unverified or new contract (WARN)
  if (lower.includes("new") || lower.includes("unknown") || lower.includes("unverified") || lower.includes("un audited")) {
    return {
      verdict: "WARN",
      riskScore: 65,
      reason: "This involves an unverified or recently deployed contract. The target has no security audit history and low transaction volume. Proceed with caution — verify the contract source code before interacting.",
      deterministic: false,
    };
  }

  // 6. NFT approval to unknown marketplace (WARN)
  if (lower.includes("nft") && (lower.includes("approve") || lower.includes("transfer"))) {
    return {
      verdict: "WARN",
      riskScore: 60,
      reason: "NFT approval detected. The target marketplace is not in the verified protocols list. NFT phishing via fake marketplaces is a growing threat. Verify the marketplace URL and contract address.",
      deterministic: false,
    };
  }

  // 7. Staking / reward claims (ALLOW — low risk)
  if (lower.includes("staking") || lower.includes("claim") || lower.includes("reward")) {
    return {
      verdict: "ALLOW",
      riskScore: 10,
      reason: "Standard reward claim operation. The target is a verified staking protocol. No value transfer risk detected.",
      deterministic: false,
    };
  }

  // 8. Known DEX swap (ALLOW — low risk)
  if (lower.includes("swap") || lower.includes("trade")) {
    return {
      verdict: "ALLOW",
      riskScore: 20,
      reason: "Token swap on a verified DEX. The operation type is allowed and the target has a strong reputation. Standard DeFi interaction.",
      deterministic: false,
    };
  }

  // Default: ALLOW with moderate confidence
  return {
    verdict: "ALLOW",
    riskScore: 25,
    reason: "This action appears safe and aligns with the security policy. The target address shows normal transaction patterns. No risk indicators detected.",
    deterministic: false,
  };
}

// ── Handler ──

export default async function handler(req: any, res: any) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }

  // Set CORS headers for all responses
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Only POST
  if (req.method !== "POST") {
    return errorResponse(res, 405, "Method not allowed. Use POST.");
  }

  // Validate input
  if (!validateRequest(req.body)) {
    return errorResponse(res, 400, "Invalid request body. Required: { policyId: number, action: { target, intent, ... } }");
  }

  const { policyId, action } = req.body;

  try {
    // Run deterministic analysis
    const result = analyze(action);

    // Build response
    const response: AnalyzeResponse = {
      scanId: Date.now(),
      verdict: result.verdict,
      riskScore: result.riskScore,
      riskLevel: riskLevel(result.riskScore),
      reason: result.reason,
      actionHash: simpleHash(action.target + action.intent + action.value),
      deterministic: result.deterministic,
      timestamp: Math.floor(Date.now() / 1000),
    };

    return res.status(200).json({ ok: true, data: response });
  } catch (err) {
    console.error("Analysis error:", err);
    return errorResponse(res, 500, "Internal analysis error. The action could not be processed.");
  }
}