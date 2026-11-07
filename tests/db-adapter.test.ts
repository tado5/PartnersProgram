import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseAdapterOptions } from "../src/server/db-adapter.mjs";

test("MariaDB adapter preserves encoded credentials, UTC and bounded pool defaults", () => {
  const options = databaseAdapterOptions("mysql://synthetic:p%40ss%3Aword@127.0.0.1:3308/synthetic");
  assert.deepEqual(options, {
    host: "127.0.0.1", port: 3308, user: "synthetic", password: "p@ss:word", database: "synthetic",
    connectionLimit: 10, connectTimeout: 5000, acquireTimeout: 10000, timezone: "Z",
  });
  assert.equal(databaseAdapterOptions("mysql://u:p@localhost/db").port, 3306);
  assert.equal(databaseAdapterOptions("mysql://u:p@[::1]:3308/db").host, "::1");
  assert.throws(() => databaseAdapterOptions("invalid synthetic URL"), {
    message: "Invalid database URL; check database connection configuration.",
  });
});

test("MariaDB adapter maps supported Prisma pool options instead of silently ignoring them", () => {
  const options = databaseAdapterOptions("mysql://u:p@localhost/db?connection_limit=3&connect_timeout=2&pool_timeout=4");
  assert.equal(options.connectionLimit, 3);
  assert.equal(options.connectTimeout, 2000);
  assert.equal(options.acquireTimeout, 4000);
  for (const suffix of ["sslaccept=accept_invalid_certs", "connection_limit=0", "pool_timeout=-1",
    "connect_timeout=NaN", "connection_limit=2&connection_limit=3"]) {
    assert.throws(() => databaseAdapterOptions(`mysql://u:p@localhost/db?${suffix}`));
  }
  assert.throws(() => databaseAdapterOptions("postgres://u:p@localhost/db"));
});
