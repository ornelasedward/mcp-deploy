import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface SamlSessionPayload {
  sub: string;
  orgId: string;
  email?: string;
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** HMAC-signed session token issued after SAML ACS (no extra JWT dependency). */
export function signSamlSession(
  payload: Omit<SamlSessionPayload, "exp">,
  secret: string,
  ttlSec = 86_400,
): string {
  const body: SamlSessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const data = b64url(Buffer.from(JSON.stringify(body), "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifySamlSession(token: string, secret: string): SamlSessionPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(data).digest());
  try {
    if (!timingSafeEqual(fromB64url(sig), fromB64url(expected))) return null;
  } catch {
    return null;
  }
  const payload = JSON.parse(fromB64url(data).toString("utf8")) as SamlSessionPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.sub || !payload.orgId) return null;
  return payload;
}

export function newSamlRequestId(): string {
  return `_${randomBytes(16).toString("hex")}`;
}
