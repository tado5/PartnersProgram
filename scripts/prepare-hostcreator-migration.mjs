import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const source = new URL("hostcreator-migration/", import.meta.url);
const target = new URL(".next/standalone/.hostcreator-migrate/", root);
if (!existsSync(new URL(".next/standalone/server.js", root))
  || !existsSync(new URL("node_modules/prisma/build/index.js", source))) {
  throw new Error("Build standalone and install the locked migration tools before packaging.");
}
const version = JSON.parse(readFileSync(new URL("node_modules/prisma/package.json", source), "utf8")).version;
const expected = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).devDependencies.prisma;
if (version !== expected) throw new Error("Migration CLI version differs from the application Prisma version.");
mkdirSync(target, { recursive: true });
for (const path of ["package.json", "package-lock.json", "prisma.config.mjs", "node_modules"]) {
  cpSync(new URL(path, source), new URL(path, target), { recursive: true });
}
cpSync(new URL("prisma/schema.prisma", root), new URL("prisma/schema.prisma", target), { recursive: true });
cpSync(new URL("prisma/migrations", root), new URL("prisma/migrations", target), { recursive: true });
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "--version"], {
  cwd: fileURLToPath(target),
  env: { ...process.env, MIGRATE_DATABASE_URL: "mysql://build:build@127.0.0.1:3306/disabled" },
  stdio: "inherit",
});
console.info("Standalone migration tools prepared; no database was accessed.");
