import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = join(root, "artifacts");
export const portableRoot = join(artifactRoot, "localops-guardian-windows-portable");

const sources = [
  ["dist", "dist"],
  ["server/index.mjs", "server/index.mjs"],
  ["server/input-validation.mjs", "server/input-validation.mjs"],
  ["server/pet-presence.mjs", "server/pet-presence.mjs"],
  ["server/runtime.mjs", "server/runtime.mjs"],
  ["server/windows-startup.mjs", "server/windows-startup.mjs"],
  ["scripts/launch-pet.mjs", "scripts/launch-pet.mjs"],
  ["src/pet-presence.mjs", "src/pet-presence.mjs"],
  ["Start LocalOps Guardian.vbs", "Start LocalOps Guardian.vbs"],
  ["portable/README.txt", "README.txt"]
];

const requiredFiles = new Set([
  "dist/index.html",
  "server/index.mjs",
  "scripts/launch-pet.mjs",
  "src/pet-presence.mjs",
  "Start LocalOps Guardian.vbs",
  "README.txt"
]);

function assertSafePackageTarget(target) {
  const path = relative(artifactRoot, resolve(target));
  if (!path || path.startsWith("..") || path.includes(`..${sep}`)) {
    throw new Error(`Portable package target escapes artifacts directory: ${target}`);
  }
}

async function filesBelow(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path, base));
    else if (entry.isFile()) files.push(relative(base, path).replaceAll("\\", "/"));
  }
  return files.sort();
}

async function fileRecord(directory, path) {
  const bytes = await readFile(join(directory, path));
  return {
    path,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

export async function buildPortablePackage(output = portableRoot) {
  assertSafePackageTarget(output);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [source, destination] of sources) {
    const sourcePath = join(root, source);
    await stat(sourcePath).catch(() => {
      throw new Error(`Portable package source is missing: ${source}. Run npm run build first.`);
    });
    const destinationPath = join(output, destination);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { recursive: true, errorOnExist: true });
  }
  const paths = (await filesBelow(output)).filter((path) => path !== "artifact-manifest.json");
  const manifest = {
    formatVersion: 1,
    sourceRevision: process.env.GITHUB_SHA || "local",
    files: await Promise.all(paths.map((path) => fileRecord(output, path)))
  };
  await writeFile(join(output, "artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { output, manifest };
}

export async function verifyPortablePackage(directory = portableRoot) {
  assertSafePackageTarget(directory);
  const manifest = JSON.parse(await readFile(join(directory, "artifact-manifest.json"), "utf8"));
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) throw new Error("Portable manifest format is invalid.");
  const actualPaths = (await filesBelow(directory)).filter((path) => path !== "artifact-manifest.json");
  const manifestPaths = manifest.files.map((item) => item.path).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(manifestPaths)) throw new Error("Portable manifest file list does not match package contents.");
  for (const required of requiredFiles) {
    if (!manifestPaths.includes(required)) throw new Error(`Portable package is missing required file: ${required}`);
  }
  for (const path of manifestPaths) {
    if (/(^|\/)(data|node_modules)(\/|$)|(^|\/)\.env($|\.)|\.(sqlite|log)$/i.test(path)) {
      throw new Error(`Portable package contains forbidden runtime or secret material: ${path}`);
    }
  }
  for (const expected of manifest.files) {
    const actual = await fileRecord(directory, expected.path);
    if (actual.size !== expected.size || actual.sha256 !== expected.sha256) {
      throw new Error(`Portable package hash mismatch: ${expected.path}`);
    }
  }
  return { directory, files: manifest.files.length, sourceRevision: manifest.sourceRevision };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const command = process.argv[2] || "build";
  if (command === "build") {
    const result = await buildPortablePackage();
    console.log(`Portable package created: ${result.output} (${result.manifest.files.length} files)`);
  } else if (command === "verify") {
    const result = await verifyPortablePackage();
    console.log(`Portable package verified: ${result.directory} (${result.files} files, ${result.sourceRevision})`);
  } else {
    throw new Error(`Unknown portable package command: ${command}`);
  }
}
