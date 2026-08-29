import crypto from "node:crypto";

/**
 * Serverseitige Verschlüsselung für API-Keys (AES-256-GCM).
 * Der Schlüssel wird aus ENCRYPTION_KEY (env) via SHA-256 abgeleitet.
 * Format: v1:<iv b64>:<authTag b64>:<ciphertext b64>
 */

function deriveKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_KEY ??
    "webpilot-dev-insecure-key-change-me"; // Nur Dev-Fallback, in .env setzen!
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Ungültiges Secret-Format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Zeigt niemals den Klartext – nur die letzten 4 Zeichen. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  const tail = plain.slice(-4);
  return `••••••••${tail}`;
}
