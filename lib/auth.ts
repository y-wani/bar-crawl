// api/_lib/auth.ts
//
// Verify Firebase ID tokens and App Check tokens with `jose` against Google's
// public JWKS — no firebase-admin needed. Both are standard RS256 JWTs; we
// validate the signature plus the issuer/audience for our project.

import { jwtVerify, createRemoteJWKSet } from "jose";
import { PROJECT_ID, PROJECT_NUMBER } from "./serviceAccount";

// Firebase ID tokens are signed by Google's secure-token service.
const idTokenJwks = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

// App Check tokens are signed by the Firebase App Check service.
const appCheckJwks = createRemoteJWKSet(
  new URL("https://firebaseappcheck.googleapis.com/v1/jwks")
);

/** Verify a Firebase ID token and return the user's uid. Throws if invalid. */
export const verifyIdToken = async (token: string): Promise<string> => {
  const { payload } = await jwtVerify(token, idTokenJwks, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  if (!payload.sub) throw new Error("ID token missing subject");
  return payload.sub;
};

/** Verify a Firebase App Check token. Throws if invalid. */
export const verifyAppCheckToken = async (token: string): Promise<void> => {
  await jwtVerify(token, appCheckJwks, {
    issuer: `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`,
    audience: `projects/${PROJECT_NUMBER}`,
  });
};
