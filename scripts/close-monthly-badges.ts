import "dotenv/config";

import { closeMonthlyBadges } from "../src/server/monthly-badges";
import { prisma } from "../src/server/db";

async function main() {
  const args = process.argv.slice(2);
  const monthArg = args.find((argument) => argument.startsWith("--month="));
  if (args.some((argument) => argument !== monthArg) || args.length > 1) {
    throw new Error("Usage: npm run badges:close [-- --month=YYYY-MM]");
  }
  const result = await closeMonthlyBadges(new Date(), monthArg?.slice("--month=".length));
  console.info(`Closed badge period ${result.period}: ${result.inserted} awards across ${result.companies} companies.`);
}

main()
  .catch((error: unknown) => {
    console.error("Monthly badge closure failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
