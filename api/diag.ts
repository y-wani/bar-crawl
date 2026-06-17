// Self-diagnosing probe: dynamically import each shared module inside try/catch
// and report the real error in the response body, so we can see exactly which
// import fails (and why) without the Vercel runtime logs.
export default async function handler(
  _req: unknown,
  res: { status: (n: number) => { json: (b: unknown) => void } }
) {
  const r: Record<string, string> = { marker: "diag-v1" };
  const probe = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      r[name] = "ok";
    } catch (e) {
      r[name] = "ERR: " + (e instanceof Error ? e.message : String(e));
    }
  };

  await probe("jose", () => import("jose"));
  await probe("serviceAccount", () => import("../lib/serviceAccount"));
  await probe("auth", () => import("../lib/auth"));
  await probe("firestore", () => import("../lib/firestore"));
  await probe("places", () => import("../lib/places"));
  await probe("cache", () => import("../lib/cache"));
  await probe("guard", () => import("../lib/guard"));

  res.status(200).json(r);
}
