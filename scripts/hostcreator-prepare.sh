#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

for tool in node tar sha256sum mktemp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Required deployment tool is missing: %s\n' "$tool" >&2
    exit 1
  fi
done

release="$(pwd -P)"
if [[ ! "$release" =~ /sub/partners/release_[0-9]{14}$ ]]; then
  printf 'Run this script only inside a new HostCreators partners release.\n' >&2
  exit 1
fi
active="$(readlink -f ../current)"
if [[ "$active" == "$release" ]]; then
  printf 'Refusing to modify the active release.\n' >&2
  exit 1
fi
if [[ -e .next || -L .next ]]; then
  printf 'The new release already contains .next; refusing to overwrite it.\n' >&2
  exit 1
fi
if [[ ! -s ../shared/.env ]]; then
  printf 'Missing shared/.env; preserve production configuration before deploying.\n' >&2
  exit 1
fi
node -e 'if (process.platform !== "linux" || process.arch !== "x64" || Number(process.versions.node.split(".")[0]) < 22) throw new Error("Requires Linux x64 and Node.js 22 or newer.");'

temporary="$(mktemp -d "$release/.runtime-download.XXXXXX")"
trap 'rm -f -- "$temporary/artifact.zip" "$temporary/runtime.tar.gz" "$temporary/commit.txt" "$temporary/SHA256SUMS" "$temporary/archive-list.txt" "$temporary/source-manifest.json" "$temporary/selected-commit.txt"; rmdir -- "$temporary"' EXIT
node scripts/download-hostcreator-artifact.mjs "$temporary/artifact.zip"
node scripts/extract-hostcreator-artifact.mjs "$temporary/artifact.zip" "$temporary"
if [[ "$(cat "$temporary/commit.txt")" != "$(cat "$temporary/selected-commit.txt")" ]]; then
  printf 'Runtime commit does not match the checked-out release.\n' >&2
  exit 1
fi
node scripts/hostcreator-source-manifest.mjs verify "$temporary/source-manifest.json" "$(cat "$temporary/commit.txt")"
if ! grep -Eq '^[a-f0-9]{64}  runtime\.tar\.gz$' "$temporary/SHA256SUMS" \
  || [[ "$(wc -l < "$temporary/SHA256SUMS")" -ne 1 ]]; then
  printf 'Invalid runtime checksum manifest.\n' >&2
  exit 1
fi
(cd "$temporary" && sha256sum -c SHA256SUMS)
tar -tzf "$temporary/runtime.tar.gz" > "$temporary/archive-list.txt"
if grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)\.env([^/]*)(/|$))' "$temporary/archive-list.txt"; then
  rm -f -- "$temporary/archive-list.txt"
  printf 'Runtime archive contains forbidden paths or environment files.\n' >&2
  exit 1
fi
rm -f -- "$temporary/archive-list.txt"

mkdir -p .next/standalone
tar -xzf "$temporary/runtime.tar.gz" -C .next/standalone
for item in .next/standalone/server.js .next/standalone/node_modules \
  .next/standalone/.next/static .next/standalone/public; do
  if [[ ! -e "$item" ]]; then
    printf 'Incomplete runtime package: %s\n' "$item" >&2
    exit 1
  fi
done
if [[ -L .env ]]; then
  printf 'Existing release .env is a symlink; refusing to overwrite it.\n' >&2
  exit 1
fi
install -m 600 ../shared/.env .env
install -m 600 ../shared/.env .next/standalone/.env
printf '\nStandalone runtime ready. No npm install, build, migration or restart was executed.\n'
du -sh .next/standalone
