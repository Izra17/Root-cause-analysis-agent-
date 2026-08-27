import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "gemini",
    configured: Boolean(GEMINI_API_KEY),
    model: MODEL,
  });
});

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({
      // Gemini uses "model" instead of "assistant"
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 12000) }],
    }));
}

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("\n")
    .trim();
}

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Agent did not return valid JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function validateAnalysis(value) {
  if (!value || typeof value !== "object") throw new Error("Invalid analysis object.");
  if (typeof value.headline !== "string") throw new Error("Missing analysis headline.");
  if (!Array.isArray(value.rootCauses)) throw new Error("Missing root causes.");
  if (!Array.isArray(value.recommendations)) throw new Error("Missing recommendations.");
  return value;
}

// Gemini's structured-output schema (same shape as your Anthropic json_schema, minus additionalProperties)
const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    overallImpact: { type: "STRING" },
    rootCauses: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          rank: { type: "NUMBER" },
          title: { type: "STRING" },
          category: { type: "STRING", enum: ["Marketing", "Inventory", "Operations", "Sales"] },
          impactPct: { type: "NUMBER" },
          confidence: { type: "STRING", enum: ["High", "Medium", "Low"] },
          evidence: { type: "STRING" },
        },
        required: ["rank", "title", "category", "impactPct", "confidence", "evidence"],
      },
    },
    recommendations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action: { type: "STRING" },
          addresses: { type: "STRING" },
          priority: { type: "STRING", enum: ["High", "Medium", "Low"] },
          expectedImpact: { type: "STRING" },
        },
        required: ["action", "addresses", "priority", "expectedImpact"],
      },
    },
  },
  required: ["headline", "overallImpact", "rootCauses", "recommendations"],
};

app.post("/api/agent", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured. Add it to backend/.env and restart the backend.",
      });
    }

    const { system, messages, mode = "analysis" } = req.body || {};
    if (typeof system !== "string" || system.length > 20000) {
      return res.status(400).json({ error: "Invalid system prompt." });
    }

    const safeMessages = cleanMessages(messages);
    if (!safeMessages.length) {
      return res.status(400).json({ error: "At least one user message is required." });
    }

    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents: safeMessages,
      generationConfig:
        mode === "analysis"
          ? {
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
              responseSchema: ANALYSIS_SCHEMA,
              thinkingConfig: { thinkingLevel: "low" },
            }
          : { maxOutputTokens: 1500, thinkingConfig: { thinkingLevel: "low" } },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini error:", response.status, errText);
      return res.status(response.status).json({ error: `Gemini API error ${response.status}` });
    }

    const data = await response.json();
    const text = extractText(data);
    if (!text) throw new Error("The AI returned an empty response.");

    if (mode === "analysis") {
      const parsed = validateAnalysis(extractJson(text));
      return res.json({ text: JSON.stringify(parsed) });
    }

    return res.json({ text });
  } catch (error) {
    console.error("Agent error:", error);
    res.status(500).json({ error: error?.message || "Unexpected agent error." });
  }
});

app.listen(PORT, () => {
  console.log(`RCA backend (Gemini) running on http://localhost:${PORT}`);
});
