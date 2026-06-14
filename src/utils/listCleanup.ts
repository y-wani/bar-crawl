// src/utils/listCleanup.ts
//
// Free, instant, dependency-free cleanup for a pasted bar-crawl list. Strips
// the common noise (numbering, bullets, leading times, trailing notes) from
// each line so the importer's matcher gets a clean "Name, Address" string.
// Handles the easy 80%; the optional AI cleanup handles gnarlier pastes.

/** Normalize a single pasted line into just the venue (name + address). */
export const cleanLine = (line: string): string =>
  line
    // leading time stamp, e.g. "9pm - ", "9:30 PM — "
    .replace(/^\s*\d{1,2}(:\d{2})?\s*[ap]\.?m\.?\s*[-–—:]\s*/i, "")
    // leading list marker, e.g. "1. ", "2) ", "- ", "• ", "* "
    .replace(/^\s*(\d+[.)]|[-–•*►▶✦●])\s*/, "")
    // trailing parenthetical/bracket note, e.g. " (9pm)", " [$5 cover]"
    .replace(/\s*[([][^)\]]*[)\]]\s*$/, "")
    .trim();

/** Clean every line of a pasted list and drop the blanks. */
export const cleanBarList = (raw: string): string[] =>
  raw
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
