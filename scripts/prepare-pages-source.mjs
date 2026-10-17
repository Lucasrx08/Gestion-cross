/** Synchronise la compilation statique avec la branche utilisée par GitHub Pages. */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url).pathname;
const manifestPath = join(root, ".github/pages-assets.json");
const allowed = path => /^(?:_next\/|_not-found\/|404\/|fonts\/)/.test(path) || [".nojekyll", "index.html", "index.txt", "404.html", "__next.__PAGE__.txt", "__next._full.txt", "__next._tree.txt", "favicon.svg", "file.svg", "globe.svg", "window.svg", "logo-bon-sauveur-cross.png"].includes(path);

async function files(directory, prefix = "") {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + item.name;
    if (item.isDirectory()) result.push(...await files(join(directory, item.name), path + "/"));
    else result.push(path);
  }
  return result.sort();
}

const output = join(root, "out");
if (process.argv.includes("--build")) {
  await rm(output, { recursive: true, force: true });
  execFileSync(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build"], {
    cwd: root, stdio: "inherit", env: { ...process.env, GITHUB_PAGES: "true" },
  });
}
await readFile(join(output, "index.html"));
const paths = await files(output);
if (paths.some(path => !allowed(path))) throw new Error("La compilation contient un chemin inattendu ; publication interrompue.");
let previous;
try { previous = JSON.parse(await readFile(manifestPath, "utf8")).files.map(file => file.path); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  previous = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(allowed);
}
const next = new Set([...paths, ".nojekyll"]);
for (const path of previous) {
  if (!allowed(path) || path.includes("..")) throw new Error("Manifeste de publication invalide.");
  if (!next.has(path)) await rm(join(root, path), { force: true });
}
const manifest = [];
for (const path of paths) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await cp(join(output, path), join(root, path));
  const bytes = await readFile(join(root, path));
  manifest.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(join(root, ".nojekyll"), "");
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, JSON.stringify({ files: manifest }, null, 2) + "\n");
console.log(`${paths.length} fichiers compilés préparés et vérifiés pour GitHub Pages.`);
