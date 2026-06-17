// src/services/geminiService.ts
//
// Optional AI cleanup for the bar-list importer. Calls our own auth-gated
// serverless proxy (/api/ai/clean), which holds the Gemini key server-side and
// rate-limits per user. It ONLY normalizes messy pasted text into a clean
// "Name, Address" list — it never resolves locations. Callers must fall back to
// the deterministic parser when this is unavailable or rate-limited.

import { postJson } from "./apiClient";

// Public, non-secret flag gating the "Clean up with AI" button. Set
// VITE_GEMINI_ENABLED=true in the build env when the server key is configured.
export const isGeminiEnabled =
  (import.meta.env.VITE_GEMINI_ENABLED as string | undefined) === "true";

/**
 * Clean a pasted list with Gemini. Returns newline-separated "Name, Address"
 * lines. Throws when the call fails — the importer catches this and keeps the
 * user's original text.
 */
export const cleanBarListWithAI = async (raw: string): Promise<string> => {
  const { text } = await postJson<{ text: string }>("/api/proxy", {
    action: "clean",
    raw,
  });
  if (!text || !text.trim()) throw new Error("AI returned no text");
  return text.trim();
};
