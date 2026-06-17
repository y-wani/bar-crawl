// api/health.ts — zero-import diagnostic. If this 500s too, the problem is the
// serverless function setup itself, not our proxy code/imports.
export default function handler(
  _req: unknown,
  res: { status: (n: number) => { json: (b: unknown) => void } }
) {
  res.status(200).json({ ok: true, ts: Date.now() });
}
