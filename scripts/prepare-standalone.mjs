import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
for (const path of [".next/standalone/server.js", ".next/static"]) {
  if (!existsSync(new URL(path, root))) {
    throw new Error(`Missing ${path}; run the production build before preparing standalone assets.`);
  }
}

for (const path of ["public", ".next/static"]) {
  if (path === "public" && !existsSync(new URL(path, root))) {
    mkdirSync(new URL(".next/standalone/public", root), { recursive: true });
    continue;
  }
  cpSync(fileURLToPath(new URL(path, root)), fileURLToPath(new URL(`.next/standalone/${path}`, root)), {
    recursive: true,
  });
}
console.info("Standalone public and static assets prepared.");
