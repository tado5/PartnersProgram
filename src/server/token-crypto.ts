import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type TokenIdentity = {
  companyId: bigint;
  partnerId: bigint;
  type: "qr" | "nfc";
  tokenHash: string;
};

export class TokenKeyMissingError extends Error {
  constructor() { super("TOKEN_ENCRYPTION_KEY is not configured."); }
}

function keyBytes(key: string | undefined): Buffer {
  if (!key) throw new TokenKeyMissingError();
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("Invalid TOKEN_ENCRYPTION_KEY.");
  return Buffer.from(key, "hex");
}

function identityBytes(identity: TokenIdentity): Buffer {
  return Buffer.from(`partner-token:v1:${identity.companyId}:${identity.partnerId}:${identity.type}:${identity.tokenHash}`);
}

export function encryptToken(value: string, identity: TokenIdentity, key: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  cipher.setAAD(identityBytes(identity));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(envelope: string, identity: TokenIdentity, key: string | undefined): string {
  const bytes = keyBytes(key);
  const [version, iv, tag, encrypted, extra] = envelope.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) {
    throw new Error("Invalid encrypted token envelope.");
  }
  const decipher = createDecipheriv("aes-256-gcm", bytes, Buffer.from(iv, "base64url"));
  decipher.setAAD(identityBytes(identity));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const value = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  const actualHash = createHash("sha256").update(value).digest();
  const expectedHash = Buffer.from(identity.tokenHash, "hex");
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || actualHash.length !== expectedHash.length ||
      !timingSafeEqual(actualHash, expectedHash)) {
    throw new Error("Encrypted token identity mismatch.");
  }
  return value;
}
