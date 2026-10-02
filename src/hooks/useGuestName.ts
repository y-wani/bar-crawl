// src/hooks/useGuestName.ts
//
// What the group calls a guest. An anonymous Firebase user has no displayName,
// and on a live crawl a nameless member renders as "?" on everyone's squad
// list — useless for "who are we waiting for". So a guest is asked once, and
// the answer is kept on this device for the next invite.
//
// localStorage throws in private-mode Safari: a failure just means they are
// asked again next time.

import { useCallback, useState } from "react";

const KEY = "bh_guest_name";
export const GUEST_NAME_MAX = 24;

const read = (): string | null => {
  try {
    const raw = localStorage.getItem(KEY)?.trim();
    return raw ? raw.slice(0, GUEST_NAME_MAX) : null;
  } catch {
    return null;
  }
};

export const useGuestName = (): [string | null, (name: string) => void] => {
  const [name, setName] = useState<string | null>(read);

  const save = useCallback((next: string) => {
    const clean = next.trim().slice(0, GUEST_NAME_MAX);
    if (!clean) return;
    setName(clean);
    try {
      localStorage.setItem(KEY, clean);
    } catch {
      /* kept in memory for this visit */
    }
  }, []);

  return [name, save];
};
