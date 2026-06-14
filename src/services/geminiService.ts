// src/services/geminiService.ts
//
// Optional AI cleanup for the bar-list importer, via the Google Gemini
// (Generative Language) API free tier. It ONLY normalizes messy pasted text
// into a clean "Name, Address" list — it never resolves locations (Places /
// geocoding still do that). Callers must fall back to the deterministic parser
// when this is unavailable or rate-limited.

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as
  | string
  | undefined;

export const isGeminiEnabled = Boolean(GEMINI_API_KEY);

// Free-tier Flash model. Swap if Google rotates the free model names
// (gemini-flash-latest always points at the newest, gemini-2.5-flash is the
// stable pin used here).
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

/**
 * Clean a pasted list with Gemini. Returns newline-separated "Name, Address"
 * lines. Throws when no key is configured or the call fails — the importer
 * catches this and keeps the user's original text.
 */
export const cleanBarListWithAI = async (raw: string): Promise<string> => {
  if (!GEMINI_API_KEY) throw new Error("Gemini is not configured");

  const response = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(raw) }] }],
      generationConfig: { temperature: 0, responseMimeType: "text/plain" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? undefined;

  if (!text || !text.trim()) throw new Error("Gemini returned no text");
  return text.trim();
};
