// Diagnostic: does importing jose + constructing a JWKS at module load crash?
import { createRemoteJWKSet, SignJWT, importPKCS8, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

export default function handler(
  _req: unknown,
  res: { status: (n: number) => { json: (b: unknown) => void } }
) {
  res.status(200).json({
    ok: true,
    jwks: typeof jwks,
    sign: typeof SignJWT,
    imp: typeof importPKCS8,
    verify: typeof jwtVerify,
  });
}
