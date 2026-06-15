// src/services/apiClient.ts
//
// Thin client for our own auth-gated serverless proxy (/api/*). The billed
// Google Places / Gemini keys now live only on the server; the browser calls
// these endpoints with the signed-in user's Firebase ID token so the proxy can
// verify + rate-limit before spending budget.

import { auth } from "../firebase/config";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
};

export { ApiError };
