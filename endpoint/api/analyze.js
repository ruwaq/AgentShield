/**
 * AgentShield MCP Endpoint — Gemini 2.5 Flash powered
 *
 * 1. Deterministic checks (instant, free)
 * 2. If not blocked → Gemini 2.5 Flash deep analysis
 * 3. Returns ALLOW | WARN | BLOCK with risk score
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Deterministic checks (free, instant) ──

function localCheck(intent, target) {
  const lower = intent.toLowerCase();

  if (lower.includes("unlimited") && (lower.includes("approve") || lower.includes("approval"))) {
    return { verdict: "BLOCK", riskScore: 95, reason: "CRITICAL: Unlimited approval detected. This is the #1 attack vector for wallet drains.", deterministic: true };
  }
  if (lower.includes("scam") || lower.includes("phish") || (lower.includes("airdrop") && lower.includes("free"))) {
    return { verdict: "BLOCK", riskScore: 92, reason: "Known phishing pattern detected. Free airdrops requesting approvals are a classic wallet drain technique.", deterministic: true };
  }
  if (target === "0x0000000000000000000000000000000000000000") {
    return { verdict: "BLOCK", riskScore: 100, reason: "Target is zero address. Blocked deterministically.", deterministic: true };
  }
  const valueMatch = intent.match(/(\d+)\s*(STT|USDC|ETH|SOMI)/i);
  if (valueMatch && parseInt(valueMatch[1]) > 50) {
    return { verdict: "BLOCK", riskScore: 90, reason: `Transfer exceeds max allowed amount per transaction.`, deterministic: true };
  }

  return null; // Not blocked — needs LLM analysis
}

// ── Gemini 2.5 Flash analysis ──

async function geminiAnalyze(intent, target, tokenSymbol, value) {
  const prompt = `You are a blockchain security firewall. Analyze this proposed on-chain action and return ONLY a JSON object with no other text.

Action to analyze:
- Intent: "${intent}"
- Target address: ${target}
- Token: ${tokenSymbol || "unknown"}
- Value: ${value || "0"}

Return exactly this JSON format:
{
  "verdict": "ALLOW" | "WARN" | "BLOCK",
  "riskScore": <number 0-100>,
  "reasoning": "<one sentence explaining the risk>"
}

Rules:
- ALLOW: safe, standard operation, no risk indicators
- WARN: suspicious but not definitively malicious (new contract, unverified, unusual amount)
- BLOCK: clear scam, phishing, unlimited approval, known malicious pattern
- Be strict: if in doubt, lean toward WARN or BLOCK
- Never ALLOW unlimited approvals or interactions with suspicious addresses`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
      }),
    });

    if (!res.ok) {
      console.error("Gemini API error:", res.status);
      return { verdict: "WARN", riskScore: 60, reasoning: "AI analysis unavailable. Defaulting to WARN for safety.", usedLLM: false };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extract JSON from response (may be wrapped in ```json blocks)
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON in response:", text.slice(0, 200));
      return { verdict: "WARN", riskScore: 55, reasoning: "AI response could not be parsed. Defaulting to WARN.", usedLLM: false };
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate and sanitize
    const verdict = ["ALLOW", "WARN", "BLOCK"].includes(result.verdict) ? result.verdict : "WARN";
    const riskScore = Math.min(100, Math.max(0, parseInt(result.riskScore) || 50));
    const reasoning = result.reasoning || "AI analysis completed.";

    return { verdict, riskScore, reasoning, usedLLM: true };
  } catch (err) {
    console.error("Gemini call failed:", err.message);
    return { verdict: "WARN", riskScore: 60, reasoning: "AI analysis temporarily unavailable. Defaulting to WARN for safety.", usedLLM: false };
  }
}

// ── Helpers ──

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

// ── Handler ──

module.exports = async function handler(req, res) {
  // CORS
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST /api/analyze" });
  }

  const { action } = req.body || {};
  if (!action?.target || !action?.intent) {
    return res.status(400).json({ ok: false, error: "Missing action.target or action.intent" });
  }

  try {
    // Step 1: Deterministic check
    const blocked = localCheck(action.intent, action.target);
    if (blocked) {
      return res.status(200).json({
        ok: true,
        data: {
          scanId: Date.now(),
          verdict: blocked.verdict,
          riskScore: blocked.riskScore,
          riskLevel: riskLevel(blocked.riskScore),
          reason: blocked.reason,
          actionHash: simpleHash(action.target + action.intent + (action.value || "0")),
          deterministic: true,
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
    }

    // Step 2: Gemini 2.5 Flash deep analysis
    const ai = await geminiAnalyze(action.intent, action.target, action.tokenSymbol, action.value);

    return res.status(200).json({
      ok: true,
      data: {
        scanId: Date.now(),
        verdict: ai.verdict,
        riskScore: ai.riskScore,
        riskLevel: riskLevel(ai.riskScore),
        reason: ai.reasoning,
        actionHash: simpleHash(action.target + action.intent + (action.value || "0")),
        deterministic: false,
        usedLLM: ai.usedLLM || false,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
};