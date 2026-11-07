import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/** @param {string} databaseUrl */
export function databaseAdapterOptions(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new Error("Invalid database URL; check database connection configuration.");
  }
  if (url.protocol !== "mysql:" || !url.hostname || url.pathname.length < 2) {
    throw new Error("A mysql:// database URL with a database name is required.");
  }
  const supported = new Set(["connection_limit", "connect_timeout", "pool_timeout"]);
  for (const key of url.searchParams.keys()) {
    if (!supported.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error("Unsupported or duplicate database URL option; configure the MariaDB adapter explicitly.");
    }
  }
  /** @param {string} key @param {number} fallback */
  function numberOption(key, fallback) {
    const raw = url.searchParams.get(key);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1) {
      throw new Error("Database pool and timeout options must be positive integers.");
    }
    return Number(raw);
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: numberOption("connection_limit", 10),
    connectTimeout: numberOption("connect_timeout", 5) * 1000,
    acquireTimeout: numberOption("pool_timeout", 10) * 1000,
    timezone: "Z",
  };
}

/** @param {string} databaseUrl */
export function createDatabaseAdapter(databaseUrl) {
  return new PrismaMariaDb(databaseAdapterOptions(databaseUrl));
}
