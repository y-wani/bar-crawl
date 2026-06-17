// api/ai/clean.ts
//
// POST { raw } -> { text }
// Auth-gated, rate-limited proxy in front of the Gemini Generative Language
// API. Normalises a messy pasted bar list into "Name, Address" lines.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  requirePost,
  verifyAuth,
  verifyAppCheck,
  enforceRateLimit,
  buckets,
  readJson,
} from "../../lib/guard";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const buildPrompt = (raw: string): string =>
  `You are cleaning a pasted bar-crawl / pub-crawl lineup so it can be imported into a route planner.

Extract every venue and output ONE per line in the format:
Name, Address

Rules:
- Include the address only if it appears in the input. If there is no address, output just the name.
- Strip all numbering, bullets, times, prices, cover charges, headers, footers, emojis, and commentary.
- Keep EVERY stop, including a line that is only an address (no name) and any
  start / end / "meet here" point — those are valid stops. When unsure whether
  a line is a stop, keep it.
- Do NOT invent or guess addresses. Do NOT add venues that aren't in the input.
- Output ONLY the list — no preamble, no markdown, no blank lines.

Input:
"""
${raw}
"""`;

interface Body {
  raw?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  if (!(await verifyAppCheck(req, res))) return;
  const user = await verifyAuth(req, res);
  if (!user) return;

  const { minute, day } = buckets();
  const ok = await enforceRateLimit(
    user.uid,
    "aiClean",
    [
      { ...minute, limit: 8 },
      { ...day, limit: 40 },
    ],
    res
  );
  if (!ok) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI cleanup is not configured" });
    return;
  }

  const { raw } = readJson<Body>(req);
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "raw text required" });
    return;
  }
  // Bound the prompt so a huge paste can't run up token cost.
  if (raw.length > 8000) {
    res.status(413).json({ error: "List too long" });
    return;
  }

  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(raw) }] }],
        generationConfig: { temperature: 0, responseMimeType: "text/plain" },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Gemini ${response.status}: ${body}`);
      res.status(502).json({ error: "Upstream AI request failed" });
      return;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? undefined;

    if (!text || !text.trim()) {
      res.status(502).json({ error: "AI returned no text" });
      return;
    }
    res.status(200).json({ text: text.trim() });
  } catch (err) {
    console.error("ai/clean failed:", err);
    res.status(502).json({ error: "Upstream AI request failed" });
  }
}
