import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const [archive, destination] = process.argv.slice(2);
if (!archive || !destination) throw new Error("ZIP archive and destination directory are required.");
const maximumSize = 256 * 1024 * 1024;
if (statSync(archive).size > maximumSize) throw new Error("Artifact ZIP exceeds the 256 MiB limit.");
const zip = readFileSync(archive);
const expected = new Map([
  ["runtime.tar.gz", maximumSize],
  ["commit.txt", 128],
  ["SHA256SUMS", 256],
]);
let end = -1;
for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65557); offset--) {
  if (zip.readUInt32LE(offset) === 0x06054b50 && offset + 22 + zip.readUInt16LE(offset + 20) === zip.length) {
    end = offset;
    break;
  }
}
if (end < 0) throw new Error("Invalid ZIP end record.");
if (zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0
  || zip.readUInt16LE(end + 8) !== 3 || zip.readUInt16LE(end + 10) !== 3) {
  throw new Error("Expected a single-volume ZIP with exactly three runtime files.");
}
const centralSize = zip.readUInt32LE(end + 12);
let cursor = zip.readUInt32LE(end + 16);
const centralEnd = cursor + centralSize;
if (centralEnd !== end) throw new Error("Invalid or unsupported ZIP central directory.");
const files = new Map();
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
for (let index = 0; index < 3; index++) {
  if (cursor + 46 > centralEnd || zip.readUInt32LE(cursor) !== 0x02014b50) {
    throw new Error("Invalid ZIP central entry.");
  }
  const flags = zip.readUInt16LE(cursor + 8);
  const method = zip.readUInt16LE(cursor + 10);
  const compressedSize = zip.readUInt32LE(cursor + 20);
  const size = zip.readUInt32LE(cursor + 24);
  const nameLength = zip.readUInt16LE(cursor + 28);
  const entryEnd = cursor + 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
  if (entryEnd > centralEnd) throw new Error("Truncated ZIP entry.");
  const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
  const limit = expected.get(name);
  if (!limit || files.has(name) || size > limit || compressedSize > maximumSize
    || (flags & 1) || ![0, 8].includes(method) || zip.readUInt16LE(cursor + 34) !== 0) {
    throw new Error("Unexpected, encrypted, duplicate or oversized ZIP file.");
  }
  const local = zip.readUInt32LE(cursor + 42);
  if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) {
    throw new Error("Invalid ZIP local entry.");
  }
  const localNameLength = zip.readUInt16LE(local + 26);
  const start = local + 30 + localNameLength + zip.readUInt16LE(local + 28);
  if (start + compressedSize > zip.readUInt32LE(end + 16)
    || zip.readUInt16LE(local + 8) !== method
    || zip.subarray(local + 30, local + 30 + localNameLength).toString("utf8") !== name) {
    throw new Error("ZIP local entry does not match its directory.");
  }
  const compressed = zip.subarray(start, start + compressedSize);
  const content = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: limit });
  if (content.length !== size) throw new Error("ZIP file size mismatch.");
  let crc = 0xffffffff;
  for (const byte of content) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  if (((crc ^ 0xffffffff) >>> 0) !== zip.readUInt32LE(cursor + 16)) {
    throw new Error("ZIP file checksum mismatch.");
  }
  files.set(name, content);
  cursor = entryEnd;
}
if (cursor !== centralEnd) throw new Error("Unexpected ZIP directory data.");
for (const [name, content] of files) {
  writeFileSync(join(destination, name), content, { mode: 0o600, flag: "wx" });
}
console.info("Runtime ZIP extracted using Node.js.");
