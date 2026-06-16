// api/_lib/serviceAccount.ts
//
// Public project identifiers + lazy parse of the service-account JSON. Replaces
// the firebase-admin SDK (which failed to bundle in the Vercel serverless
// runtime). PROJECT_ID / PROJECT_NUMBER are public (they're already in the
// client bundle) and are used to validate token issuers/audiences; the
// service-account key is used only to mint a Firestore access token.

export const PROJECT_ID = "bar-crawl-planner-5985f";
export const PROJECT_NUMBER = "235279583042"; // for App Check token audience

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cached: ServiceAccount | undefined;

export const getServiceAccount = (): ServiceAccount => {
  if (cached) return cached;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");

  const json = JSON.parse(raw) as ServiceAccount;
  // Env stores often escape the key's newlines as literal "\n".
  json.private_key = json.private_key.replace(/\\n/g, "\n");
  cached = json;
  return cached;
};
