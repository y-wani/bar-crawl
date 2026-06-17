// Diagnostic: does importing our _lib chain (guard -> auth + firestore) crash
// at load? Only references requirePost; no env or network needed.
import { requirePost } from "../lib/guard";

export default function handler(
  _req: unknown,
  res: { status: (n: number) => { json: (b: unknown) => void } }
) {
  res.status(200).json({ ok: true, requirePost: typeof requirePost });
}
