import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

// Include the runtime dependency closure, even packages tree-shaken by a host.
// Development tools and host-provided Obsidian dependencies are excluded.
export async function writeDependencyNotices(outputDirectory) {
  const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  const sections = ["Runtime dependency licenses (including transitive dependencies).\n"];
  for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!path.startsWith("node_modules/") || entry.dev || entry.link) continue;
    const directory = resolve(root, path);
    const names = (await readdir(directory, { withFileTypes: true }))
      .filter(file => file.isFile() && /^(licen[cs]e|notice|copying)([.-]|$)/i.test(file.name))
      .map(file => file.name).sort();
    const texts = await Promise.all(names.map(name => readFile(resolve(directory, name), "utf8")));
    if (!texts.length && path === "node_modules/remark-math" && entry.version === "6.0.0") {
      // This npm tarball omits the upstream repository's MIT license file.
      texts.push(await readFile(resolve(root, "licenses/remark-math.txt"), "utf8"));
    }
    if (!texts.length) throw new Error(`Missing license text for ${path}@${entry.version}`);
    sections.push(`${path.slice("node_modules/".length)}@${entry.version} (${entry.license ?? "see below"})\n\n${texts.join("\n\n")}`);
  }
  await writeFile(resolve(outputDirectory, "THIRD_PARTY_LICENSES.txt"), sections.join("\n\n--------------------\n\n"));
  await copyFile(resolve(root, "LICENSE"), resolve(outputDirectory, "LICENSE"));
}
