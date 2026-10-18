import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });

try {
  const rows = await prisma.$queryRaw`SELECT 1 AS connection_check`;
  if (rows.length !== 1 || Number(rows[0].connection_check) !== 1) {
    throw new Error("Unexpected database response.");
  }
  console.info("Database connection: OK (SELECT 1). No data was changed.");
} catch (error) {
  const code = error?.errorCode ?? error?.code;
  const descriptions = {
    P1000: "Authentication failed. Check the database username and password.",
    P1001: "Database server is unreachable. Check the host, port and network access.",
    P1002: "Database connection timed out.",
    P1003: "The configured database does not exist.",
    P1010: "The database user does not have access to the configured database.",
    P1011: "Database TLS connection failed.",
  };
  console.error(
    `Database connection: FAILED. ${descriptions[code] ?? "Check database configuration and contact hosting support."}`,
  );
  if (typeof code === "string" && /^P\d{4}$/.test(code)) {
    console.error(`Prisma error code: ${code}`);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
