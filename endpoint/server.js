/**
 * AgentShield MCP Endpoint — Standalone Node.js Server
 * Deploy to Railway, Render, or any Node.js hosting.
 *
 * POST /api/analyze
 * Receives a proposed on-chain action, runs deterministic checks,
 * returns ALLOW | WARN | BLOCK with risk score.
 */

const http = require("http");

const PORT = process.env.PORT || 3000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── Validation ──

function validateRequest(body) {
  if (!body || typeof body !== "object") return false;
  if (!body.action || typeof body.action !== "object") return false;
  if (typeof body.action.target !== "string" || !body.action.target.startsWith("0x")) return false;
  if (typeof body.action.intent !== "string" || body.action.intent.length === 0) return false;
  return true;
}

// ── Analysis Engine ──

function analyze(action) {
  const lower = action.intent.toLowerCase();

  // Unlimited approval → BLOCK
  if (lower.includes("unlimited") && (lower.includes("approve") || lower.includes("approval"))) {
    return { verdict: "BLOCK", riskScore: 95, reason: "CRITICAL: Unlimited approval detected. This is the #1 attack vector for wallet drains. Blocked deterministically.", deterministic: true };
  }

  // Scam/phishing → BLOCK
  if (lower.includes("scam") || lower.includes("phish") || (lower.includes("airdrop") && lower.includes("free"))) {
    return { verdict: "BLOCK", riskScore: 92, reason: "This matches known phishing patterns. Free airdrops requesting approvals are a classic wallet drain technique. Blocked by deterministic pattern matching.", deterministic: true };
  }

  // Zero address → BLOCK
  if (action.target === "0x0000000000000000000000000000000000000000") {
    return { verdict: "BLOCK", riskScore: 100, reason: "Target is the zero address. Blocked deterministically.", deterministic: true };
  }

  // Exceeds max spend → BLOCK
  const valueMatch = action.intent.match(/(\d+)\s*(STT|USDC|ETH|SOMI)/i);
  if (valueMatch && parseInt(valueMatch[1]) > 50) {
    return { verdict: "BLOCK", riskScore: 90, reason: `This transfer exceeds the maximum allowed amount per transaction. Deterministic block.`, deterministic: true };
  }

  // Unverified contract → WARN
  if (lower.includes("new") || lower.includes("unknown") || lower.includes("unverified")) {
    return { verdict: "WARN", riskScore: 65, reason: "This involves an unverified or recently deployed contract. Proceed with caution.", deterministic: false };
  }

  // NFT approval → WARN
  if (lower.includes("nft") && (lower.includes("approve") || lower.includes("transfer"))) {
    return { verdict: "WARN", riskScore: 60, reason: "NFT approval detected. Verify the marketplace before proceeding.", deterministic: false };
  }

  // Safe patterns → ALLOW
  if (lower.includes("staking") || lower.includes("claim") || lower.includes("reward")) {
    return { verdict: "ALLOW", riskScore: 10, reason: "Standard reward claim. No risk detected.", deterministic: false };
  }
  if (lower.includes("swap") || lower.includes("trade")) {
    return { verdict: "ALLOW", riskScore: 20, reason: "Standard DeFi swap. No risk indicators.", deterministic: false };
  }

  // Default → ALLOW
  return { verdict: "ALLOW", riskScore: 25, reason: "This action appears safe. No risk indicators detected.", deterministic: false };
}

function riskLevel(score) {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function simpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return "0x" + Math.abs(hash).toString(16).padStart(64, "0");
}

// ── Server ──

const server = http.createServer((req, res) => {
  // CORS
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  // Health check
  if (req.method === "GET" && req.url === "/") {
    return res.writeHead(200).end(JSON.stringify({ ok: true, service: "AgentShield MCP Endpoint", version: "1.0.0" }));
  }

  // Only POST /api/analyze
  if (req.method !== "POST" || req.url !== "/api/analyze") {
    return res.writeHead(405).end(JSON.stringify({ ok: false, error: "Method not allowed. Use POST /api/analyze" }));
  }

  // Parse body
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    try {
      const parsed = JSON.parse(body);

      if (!validateRequest(parsed)) {
        return res.writeHead(400).end(JSON.stringify({ ok: false, error: "Invalid request. Required: { action: { target, intent, ... } }" }));
      }

      const result = analyze(parsed.action);

      const response = {
        ok: true,
        data: {
          scanId: Date.now(),
          verdict: result.verdict,
          riskScore: result.riskScore,
          riskLevel: riskLevel(result.riskScore),
          reason: result.reason,
          actionHash: simpleHash(parsed.action.target + parsed.action.intent + (parsed.action.value || "0")),
          deterministic: result.deterministic,
          timestamp: Math.floor(Date.now() / 1000),
        },
      };

      return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(response));
    } catch (err) {
      console.error("Analysis error:", err);
      return res.writeHead(500).end(JSON.stringify({ ok: false, error: "Internal analysis error." }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`AgentShield MCP Endpoint running on port ${PORT}`);
});