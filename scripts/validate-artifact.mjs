import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workerPath = resolve("dist/server/index.js");
const manifestPath = resolve("dist/.openai/hosting.json");
const [source, manifestText] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);

const manifest = JSON.parse(manifestText);
assert.equal(manifest.d1, "DB");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(typeof workerModule.default?.fetch, "function");
console.log("Company Task Board artifact is valid");
