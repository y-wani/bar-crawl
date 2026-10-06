// src/utils/orgBranding.ts
//
// Organization mode: an org page (/o/<slug>) wears the organizer's colours,
// not BarHop's amber. The whole app is themed through a handful of --accent
// tokens (styles/tokens.css), so branding is just re-declaring those on the
// page's root element. Everything an org can set arrives from a Firestore doc,
// so it is validated here before it reaches a style attribute.

import type { CSSProperties } from "react";

/** Org slugs double as URL segments and Firestore doc ids. */
export const VALID_ORG_SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const isValidOrgSlug = (slug: string | undefined): slug is string =>
  !!slug && VALID_ORG_SLUG.test(slug);

/** "#abc" or "#aabbcc" → [r, g, b], anything else → null. */
export const parseHexColor = (value: unknown): [number, number, number] | null => {
  if (typeof value !== "string") return null;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
const luminance = ([r, g, b]: [number, number, number]): number => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const toHex = (rgb: number[]): string =>
  `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;

/** The page sits on near-black (#0b0a12), so a dark brand colour would vanish
 *  as button text and borders. Lighten it toward white until it reads; a
 *  light colour is used as-is. */
const MIN_ACCENT_LUMINANCE = 0.18;

const ensureReadableOnDark = (rgb: [number, number, number]): [number, number, number] => {
  let out = rgb;
  for (let step = 0; step < 20 && luminance(out) < MIN_ACCENT_LUMINANCE; step += 1) {
    out = out.map((c) => c + (255 - c) * 0.12) as [number, number, number];
  }
  return out;
};

/**
 * CSS custom properties that re-theme everything inside the element they are
 * set on. Returns {} for a missing or malformed colour, so the page falls back
 * to BarHop's own accent rather than rendering something broken.
 */
export const brandStyle = (accent: unknown): CSSProperties => {
  const parsed = parseHexColor(accent);
  if (!parsed) return {};
  const rgb = ensureReadableOnDark(parsed);
  const [r, g, b] = rgb;
  const vars: Record<string, string> = {
    "--accent": toHex(rgb),
    "--accent-bright": toHex(rgb.map((c) => c + (255 - c) * 0.25)),
    "--accent-deep": toHex(rgb.map((c) => c * 0.78)),
    "--accent-soft": `rgba(${r}, ${g}, ${b}, 0.14)`,
    "--accent-glow": `rgba(${r}, ${g}, ${b}, 0.35)`,
    // Text on a filled accent button: whichever of near-black or white
    // contrasts more with the brand colour.
    "--text-on-accent": luminance(rgb) > 0.4 ? "#1a1208" : "#ffffff",
  };
  return vars as CSSProperties;
};
