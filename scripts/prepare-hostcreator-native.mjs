import { cpSync, existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const target = new URL(".next/standalone/node_modules/", root);
const source = new URL("hostcreator-native/node_modules/", import.meta.url);
if (!existsSync(new URL(".next/standalone/server.js", root))) {
  throw new Error("Build standalone before preparing HostCreators native dependencies.");
}
for (const [parent, native] of [
  ["@node-rs/argon2", "@node-rs/argon2-linux-x64-musl"],
  ["sharp", "@img/sharp-linuxmusl-x64"],
  ["sharp", "@img/sharp-libvips-linuxmusl-x64"],
]) {
  const metadata = JSON.parse(readFileSync(new URL(`${parent}/package.json`, target), "utf8"));
  const binary = JSON.parse(readFileSync(new URL(`${native}/package.json`, source), "utf8"));
  if (metadata.optionalDependencies[native] !== binary.version) {
    throw new Error(`Native dependency version mismatch: ${native}. Update the locked HostCreators native tools.`);
  }
  cpSync(new URL(native, source), new URL(native, target), { recursive: true });
}
console.info("HostCreators Linux x64 musl Argon2 and sharp dependencies prepared.");
