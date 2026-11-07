import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const excluded = (path) => path.split("/").some((part) => part === ".env" || part.startsWith(".env."))
  && path !== ".env.example";
const hash = (content) => createHash("sha256").update(content).digest("hex");

export function createSourceManifest(root, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid source commit.");
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0").filter((path) => path && !excluded(path)).sort();
  const files = paths.map((path) => {
    if (!lstatSync(resolve(root, path)).isFile()) throw new Error(`Unsupported tracked source: ${path}`);
    return { path, sha256: hash(readFileSync(resolve(root, path))) };
  });
  return { commit, files };
}

export function verifySourceManifest(root, manifest, commit) {
  if (manifest.commit !== commit || !/^[a-f0-9]{40}$/.test(commit)
    || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Invalid source manifest or mismatched commit.");
  }
  const paths = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== "string" || !file.path || file.path.startsWith("/")
      || file.path.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")
      || excluded(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || paths.has(file.path)) {
      throw new Error("Invalid or duplicate source manifest path.");
    }
    paths.add(file.path);
    let current = resolve(root);
    for (const part of file.path.split("/")) {
      current += sep + part;
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Source symlink is not allowed: ${file.path}`);
    }
    if (!lstatSync(current).isFile() || hash(readFileSync(current)) !== file.sha256) {
      throw new Error(`Deployment source mismatch: ${file.path}`);
    }
  }
  // Extra runtime/build output is allowed outside the application source trees.
  function checkDirectory(path) {
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) checkDirectory(child);
      else if (!paths.has(child)) throw new Error(`Unexpected deployment source: ${child}`);
    }
  }
  for (const path of ["src", "prisma", "scripts", "public", "tests"]) {
    if (paths.has(path) || [...paths].some((file) => file.startsWith(`${path}/`))) checkDirectory(path);
    else if (readdirSync(root).includes(path)) checkDirectory(path);
  }
  console.info(`Deployment sources verified against CI commit ${commit} (${paths.size} files).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, path, commit] = process.argv.slice(2);
  if (mode === "create") {
    writeFileSync(path, JSON.stringify(createSourceManifest(process.cwd(), commit)));
  } else if (mode === "verify") {
    verifySourceManifest(process.cwd(), JSON.parse(readFileSync(path, "utf8")), commit);
  } else {
    throw new Error("Use create or verify with a manifest path and commit.");
  }
}
