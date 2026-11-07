import assert from "node:assert/strict";
import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { test } from "node:test";

import { decryptToken, encryptToken, TokenKeyMissingError, type TokenIdentity } from "../src/server/token-crypto";

function fixture() {
  const value = randomBytes(32).toString("base64url");
  const key = randomBytes(32).toString("hex");
  const identity: TokenIdentity = {
    companyId: BigInt("9007199254740993"),
    partnerId: BigInt("9007199254740995"),
    type: "qr",
    tokenHash: createHash("sha256").update(value).digest("hex"),
  };
  return { value, key, identity };
}

test("token encryption round-trips QR and NFC using authenticated AES-256-GCM", () => {
  for (const type of ["qr", "nfc"] as const) {
    const { value, key, identity: original } = fixture();
    const identity = { ...original, type };
    const envelope = encryptToken(value, identity, key);
    assert.equal(decryptToken(envelope, identity, key), value);
    assert.equal(decryptToken(envelope, identity, key.toUpperCase()), value);
    assert.ok(!envelope.includes(value));
    assert.ok(!envelope.includes(key));
    const [version, iv, tag, ciphertext] = envelope.split(".");
    assert.equal(version, "v1");
    assert.equal(envelope.split(".").length, 4);
    assert.equal(Buffer.from(iv, "base64url").length, 12);
    assert.equal(Buffer.from(tag, "base64url").length, 16);
    assert.equal(Buffer.from(ciphertext, "base64url").length, Buffer.byteLength(value));

    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(
      `partner-token:v1:${identity.companyId}:${identity.partnerId}:${identity.type}:${identity.tokenHash}`,
    ));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    assert.equal(Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final(),
    ]).toString("utf8"), value);
  }
});

test("encrypting the same token repeatedly generates independent random IVs and ciphertext", () => {
  const { value, key, identity } = fixture();
  const envelopes = Array.from({ length: 16 }, () => encryptToken(value, identity, key));
  assert.equal(new Set(envelopes).size, envelopes.length);
  assert.equal(new Set(envelopes.map((envelope) => envelope.split(".")[1])).size, envelopes.length);
  assert.equal(new Set(envelopes.map((envelope) => envelope.split(".")[3])).size, envelopes.length);
  for (const envelope of envelopes) assert.equal(decryptToken(envelope, identity, key), value);
});

test("wrong keys and tampering with the IV, authentication tag or ciphertext are rejected", () => {
  const { value, key, identity } = fixture();
  const envelope = encryptToken(value, identity, key);
  assert.throws(() => decryptToken(envelope, identity, randomBytes(32).toString("hex")));
  for (const index of [1, 2, 3]) {
    const parts = envelope.split(".");
    const bytes = Buffer.from(parts[index], "base64url");
    bytes[0] ^= 1;
    parts[index] = bytes.toString("base64url");
    assert.throws(() => decryptToken(parts.join("."), identity, key), `tampered envelope part ${index}`);
  }
});

test("every identity component is authenticated, including bigint IDs beyond Number precision", () => {
  const { value, key, identity } = fixture();
  const envelope = encryptToken(value, identity, key);
  const altered: TokenIdentity[] = [
    { ...identity, companyId: identity.companyId + BigInt(1) },
    { ...identity, partnerId: identity.partnerId + BigInt(1) },
    { ...identity, type: "nfc" },
    { ...identity, tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex") },
  ];
  for (const other of altered) assert.throws(() => decryptToken(envelope, other, key));
  assert.equal(decryptToken(envelope, { ...identity }, key), value);
});

test("decryption also verifies token syntax and the recovered plaintext hash", () => {
  const { value, key, identity } = fixture();
  const wrongHash = { ...identity, tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex") };
  assert.throws(() => decryptToken(encryptToken(value, wrongHash, key), wrongHash, key));
  for (const invalid of ["", "short", `${value}=`, "!".repeat(43), "é".repeat(43)]) {
    const matching = { ...identity, tokenHash: createHash("sha256").update(invalid).digest("hex") };
    assert.throws(() => decryptToken(encryptToken(invalid, matching, key), matching, key));
  }
});

test("malformed, truncated and unsupported envelope versions fail closed", () => {
  const { value, key, identity } = fixture();
  const envelope = encryptToken(value, identity, key);
  const [version, iv, tag, ciphertext] = envelope.split(".");
  for (const malformed of [
    "", "not-an-envelope", envelope.replace(/^v1/, "v2"), `${envelope}.extra`,
    `${version}.${iv}.${tag}`, `${version}..${tag}.${ciphertext}`,
    `${version}.${iv}..${ciphertext}`, `${version}.${iv}.${tag}.`,
    `${version}.${Buffer.alloc(1).toString("base64url")}.${tag}.${ciphertext}`,
    `${version}.${iv}.${Buffer.alloc(1).toString("base64url")}.${ciphertext}`,
  ]) assert.throws(() => decryptToken(malformed, identity, key));
});

test("missing encryption configuration has a distinguishable error on encrypt and decrypt", () => {
  const { value, key, identity } = fixture();
  const envelope = encryptToken(value, identity, key);
  for (const missing of [undefined, ""]) {
    assert.throws(() => encryptToken(value, identity, missing), TokenKeyMissingError);
    assert.throws(() => decryptToken(envelope, identity, missing), TokenKeyMissingError);
  }
});

test("keys must be exactly 32 bytes represented as hexadecimal, never padded or truncated", () => {
  const { value, key, identity } = fixture();
  const envelope = encryptToken(value, identity, key);
  for (const invalid of [" ", "a".repeat(63), "a".repeat(65), "z".repeat(64), ` ${key}`, `${key}\n`]) {
    for (const operation of [
      () => encryptToken(value, identity, invalid),
      () => decryptToken(envelope, identity, invalid),
    ]) {
      assert.throws(operation, (error) => error instanceof Error && !(error instanceof TokenKeyMissingError));
    }
  }
});
