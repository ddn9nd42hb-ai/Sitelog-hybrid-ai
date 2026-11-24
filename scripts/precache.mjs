/**
 * Post-build step: make the service worker precache the hashed build assets.
 *
 * Vite fingerprints `assets/index-<hash>.js`, so the service worker cannot list
 * them ahead of time. This script reads `dist/`, injects the list (and a cache
 * version derived from it) into `dist/sw.js`, and leaves the source `public/sw.js`
 * clean for development.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const DIST = "dist";

async function walk(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const files = await walk(DIST);
const assets = files.filter((f) => f !== "sw.js" && !f.endsWith(".map")).map((f) => `/${f}`);
const version = "sitelog-" + createHash("sha256").update(assets.join("|")).digest("hex").slice(0, 12);

const swPath = join(DIST, "sw.js");
const source = await readFile(swPath, "utf8");
const patched = source
  .replace('const VERSION = "sitelog-dev";', `const VERSION = ${JSON.stringify(version)};`)
  .replace("self.__SITELOG_PRECACHE__ || []", JSON.stringify(assets));

await writeFile(swPath, patched, "utf8");
console.log(`sw.js: ${assets.length} assets precached, cache ${version}`);
