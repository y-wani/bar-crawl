// src/services/apiClient.ts
//
// Thin client for our own auth-gated serverless proxy (/api/*). The billed
// Google Places / Gemini keys now live only on the server; the browser calls
// these endpoints with the signed-in user's Firebase ID token so the proxy can
// verify + rate-limit before spending budget.

import { auth, appCheck } from "../firebase/config";
import { getToken } from "firebase/app-check";

class ApiError extends Error {
  status: number;
  /** Machine-readable code from the server, e.g. "GUEST_QUOTA". Optional, so
   *  existing two-argument call sites keep working. Note: no constructor
   *  parameter properties — tsconfig.app.json sets erasableSyntaxOnly. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

/** POST JSON to a proxy endpoint with the current user's ID token attached. */
export const postJson = async <T>(
  path: string,
  body: unknown
): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, "You must be signed in");

  // Firebase refreshes the token automatically if it's near expiry.
  const token = await user.getIdToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Attach an App Check token when configured. Harmless when the server isn't
  // enforcing App Check yet; required once it is.
  if (appCheck) {
    try {
      const { token: appCheckToken } = await getToken(appCheck);
      headers["X-Firebase-AppCheck"] = appCheckToken;
    } catch {
      // Proceed without it; the server only blocks when enforcement is on.
    }
  }

  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      if (typeof data?.code === "string") code = data.code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, code);
  }

  return (await res.json()) as T;
};

export { ApiError };
