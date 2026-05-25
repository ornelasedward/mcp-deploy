import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function keyFromSecret(secret: string): Buffer {
  return scryptSync(secret, "agentd-secrets", 32);
}

export function encryptSecret(plaintext: string, encryptionKey: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, keyFromSecret(encryptionKey), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([enc, tag]);
  return {
    ciphertext: payload.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptSecret(ciphertext: string, iv: string, encryptionKey: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv(ALGO, keyFromSecret(encryptionKey), Buffer.from(iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
