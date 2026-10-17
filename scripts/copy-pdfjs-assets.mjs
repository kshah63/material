// postinstall: copy pdf.js's runtime files from node_modules into public/pdfjs/,
// so the copy served to the browser is always the installed worker's version
// (docs/WORKSHEETS.md §4.5). Without wasm/ a JBIG2, JPEG 2000 or CCITT scan draws
// blank; without iccs/ a CMYK image draws off-colour (§8.3). version.json is
// written last, and lib/worksheet/source.ts refuses to open a bank unless it
// matches the worker, so a missing or stale copy is an error on screen.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRS = ["wasm", "cmaps", "standard_fonts", "iccs"];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgJson = createRequire(import.meta.url).resolve("pdfjs-dist/package.json");
const src = path.dirname(pkgJson);
const dest = path.join(root, "public", "pdfjs");
const { version } = JSON.parse(readFileSync(pkgJson, "utf8"));

for (const dir of DIRS) {
  if (!existsSync(path.join(src, dir))) {
    console.error(`copy-pdfjs-assets: pdfjs-dist ${version} has no ${dir}/ folder`);
    process.exit(1);
  }
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of DIRS) {
  cpSync(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
writeFileSync(path.join(dest, "version.json"), JSON.stringify({ version }) + "\n");
console.log(`copy-pdfjs-assets: pdfjs-dist ${version} -> public/pdfjs/`);
