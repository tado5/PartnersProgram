import { createWriteStream, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";

const token = process.env.HOSTCREATOR_GITHUB_TOKEN;
const destination = process.argv[2];
if (!token || !destination) {
  throw new Error("HOSTCREATOR_GITHUB_TOKEN and a destination ZIP path are required.");
}

const api = "https://api.github.com/repos/tado5/PartnersProgram";
const deadline = Date.now() + 25 * 60 * 1000;
async function request(path, redirect = "follow") {
  const response = await fetch(`${api}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect,
    signal: AbortSignal.timeout(30_000),
  });
  if (redirect === "manual" && response.status === 302) return response;
  if (!response.ok) {
    throw new Error(`GitHub API request failed (HTTP ${response.status}); check repository Actions read access.`);
  }
  return response;
}

let runId;
let sha;
let completed = false;
console.info("Waiting for successful main push CI; checkout sources will be verified before preparation.");
while (Date.now() < deadline) {
  const response = await request(runId ? `/actions/runs/${runId}` : `/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=5`);
  const data = await response.json();
  if (runId && (data.id !== runId || data.head_sha !== sha || data.head_branch !== "main" || data.event !== "push")) {
    throw new Error("GitHub returned a mismatched CI run identity.");
  }
  if (!runId && !Array.isArray(data.workflow_runs)) {
    throw new Error("GitHub returned an invalid workflow-run response.");
  }
  const run = (runId ? [data] : data.workflow_runs)
    .filter((item) => (!runId || item.id === runId) && item.head_branch === "main" && item.event === "push")
    .sort((a, b) => b.id - a.id)[0];
  if (run && !runId) {
    if (!Number.isSafeInteger(run.id) || !/^[a-f0-9]{40}$/.test(run.head_sha)) throw new Error("Invalid CI run identity.");
    runId = run.id;
    sha = run.head_sha;
  }
  if (run?.status === "completed") {
    if (run.conclusion !== "success") {
      throw new Error(`CI run ${run.id} finished with ${run.conclusion}; deployment stopped.`);
    }
    if (!Number.isSafeInteger(run.id)) throw new Error("Invalid CI run ID.");
    completed = true;
    break;
  }
  if (Date.now() + 15_000 >= deadline) throw new Error("Timed out waiting for CI; retry deployment after CI completes.");
  await sleep(15_000);
}
if (!completed) throw new Error("Timed out waiting for CI; retry deployment after CI completes.");

const response = await request(`/actions/runs/${runId}/artifacts?per_page=100`);
const data = await response.json();
if (!Array.isArray(data.artifacts)) throw new Error("GitHub returned an invalid artifact response.");
const artifact = data.artifacts.find((item) => item.name === `hostcreator-standalone-${sha}`);
if (!artifact || artifact.expired || !Number.isSafeInteger(artifact.id)) {
  throw new Error("Matching runtime artifact is missing or expired; create a new successful push CI run.");
}

const redirect = await request(`/actions/artifacts/${artifact.id}/zip`, "manual");
const location = redirect.headers.get("location");
if (redirect.status !== 302 || !location) throw new Error("GitHub did not return an artifact download redirect.");
const url = new URL(location);
if (url.protocol !== "https:" || url.username || url.password) {
  throw new Error("GitHub returned an unsafe artifact download URL.");
}
// The signed storage URL must not receive the repository access token.
const download = await fetch(url, { signal: AbortSignal.timeout(120_000) });
if (!download.ok || !download.body) {
  throw new Error(`Artifact download failed (HTTP ${download.status}).`);
}
await pipeline(Readable.fromWeb(download.body), createWriteStream(destination, { mode: 0o600 }));
writeFileSync(join(dirname(destination), "selected-commit.txt"), `${sha}\n`, { mode: 0o600 });
console.info(`Runtime artifact downloaded from successful CI run ${runId}.`);
