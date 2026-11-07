import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

const schema = z.strictObject({ value: z.string() });

function request(body: string, headers?: HeadersInit) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
    body,
  });
}

async function loadHttpReader() {
  process.env.DATABASE_URL = "mysql://disabled:disabled@127.0.0.1:3308/disabled";
  return import("../src/server/auth/http");
}

test("readJson parses bounded JSON and preserves schema validation", async () => {
  const { readJson } = await loadHttpReader();
  const valid = await readJson(request(JSON.stringify({ value: "ok" })), schema);
  assert.deepEqual(valid, { data: { value: "ok" } });

  const invalid = await readJson(request(JSON.stringify({ value: 1 })), schema);
  assert.equal("response" in invalid && invalid.response.status, 400);
  assert.equal(
    "response" in invalid && (await invalid.response.json()).error.code,
    "VALIDATION_ERROR",
  );
});

test("readJson rejects oversized declared and streamed JSON bodies", async () => {
  const { MAX_JSON_BODY_BYTES, readJson } = await loadHttpReader();
  const declared = await readJson(
    request("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
    schema,
  );
  assert.equal("response" in declared && declared.response.status, 413);
  assert.equal(
    "response" in declared && (await declared.response.json()).error.code,
    "PAYLOAD_TOO_LARGE",
  );

  const exactBody = JSON.stringify({ value: "x".repeat(MAX_JSON_BODY_BYTES - 12) });
  assert.equal(new TextEncoder().encode(exactBody).byteLength, MAX_JSON_BODY_BYTES);
  const exactRequest = request(exactBody);
  assert.equal(exactRequest.headers.get("content-length"), null);
  const exact = await readJson(exactRequest, schema);
  assert.ok("data" in exact && exact.data.value.length === MAX_JSON_BODY_BYTES - 12);

  const streamedRequest = request(JSON.stringify({
    value: "x".repeat(MAX_JSON_BODY_BYTES - 11),
  }));
  assert.equal(streamedRequest.headers.get("content-length"), null);
  const streamed = await readJson(streamedRequest, schema);
  assert.equal("response" in streamed && streamed.response.status, 413);
});

test("readJson returns the existing invalid-JSON response for malformed UTF-8 or JSON", async () => {
  const { readJson } = await loadHttpReader();
  const malformed = await readJson(request("{"), schema);
  assert.equal("response" in malformed && malformed.response.status, 400);
  assert.equal(
    "response" in malformed && (await malformed.response.json()).error.code,
    "INVALID_JSON",
  );

  const invalidUtf8 = new Request("http://localhost/api/test", {
    method: "POST",
    body: new Uint8Array([0xff]),
  });
  const invalidEncoding = await readJson(invalidUtf8, schema);
  assert.equal("response" in invalidEncoding && invalidEncoding.response.status, 400);
});
