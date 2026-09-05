#!/usr/bin/env node
/**
 * Bundles the exact OSRS Wiki DPS calculator engine into this application.
 *
 * The upstream project and this project are GPL-3.0 licensed. Keep the pinned
 * revision and attribution file with the generated bundle.
 *
 * Usage:
 *   node scripts/sync-dps-engine.mjs [/path/to/osrs-dps-calc]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedSource = process.argv[2];
let sourceRoot = requestedSource ? resolve(requestedSource) : null;
let temporaryRoot = null;

if (!sourceRoot) {
  temporaryRoot = mkdtempSync(join(tmpdir(), "osrs-dps-calc-"));
  sourceRoot = join(temporaryRoot, "source");
  execFileSync(
    "git",
    ["clone", "--depth", "1", "https://github.com/weirdgloop/osrs-dps-calc.git", sourceRoot],
    { stdio: "inherit" },
  );
}

const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();
const outputDir = join(projectRoot, "src", "vendor", "osrs-wiki");
mkdirSync(outputDir, { recursive: true });

const entry = `
export { default as PlayerVsNPCCalc } from "@/lib/PlayerVsNPCCalc";
export { default as NPCVsPlayerCalc } from "@/lib/NPCVsPlayerCalc";
export {
  availableEquipment,
  ammoApplicability,
  calculateAttackSpeed,
  calculateEquipmentBonusesFromGear,
  getCanonicalEquipment,
  getCanonicalItemId
} from "@/lib/Equipment";
export { getMonsters, INITIAL_MONSTER_INPUTS } from "@/lib/Monsters";
export { getCombatStylesForCategory, PotionMap } from "@/utils";
export { Prayer, PrayerMap } from "@/enums/Prayer";
export { default as Potion } from "@/enums/Potion";
export { spells } from "@/types/Spell";
`;

await build({
  stdin: {
    contents: entry,
    resolveDir: sourceRoot,
    sourcefile: "whetstone-engine-entry.ts",
    loader: "ts",
  },
  absWorkingDir: sourceRoot,
  alias: {
    "@": join(sourceRoot, "src"),
  },
  nodePaths: [join(projectRoot, "node_modules")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: join(outputDir, "engine.generated.js"),
  sourcemap: false,
  minify: false,
  treeShaking: true,
  banner: {
    js: `/* Generated from weirdgloop/osrs-dps-calc@${revision}; GPL-3.0. Do not edit. */`,
  },
  plugins: [
    {
      name: "discard-upstream-images",
      setup(buildApi) {
        buildApi.onLoad({ filter: /\.png$/ }, () => ({
          contents: "export default '';",
          loader: "js",
        }));
      },
    },
  ],
});

writeFileSync(
  join(outputDir, "version.json"),
  `${JSON.stringify({
    repository: "https://github.com/weirdgloop/osrs-dps-calc",
    revision,
    license: "GPL-3.0",
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`,
);

const notice = `OSRS Wiki DPS Calculator engine

Source: https://github.com/weirdgloop/osrs-dps-calc
Revision: ${revision}
License: GNU General Public License v3.0

The generated engine bundle is derived from the upstream calculator. UI image
imports are replaced with empty values because Whetstone does not render them.
Combat formulas, equipment metadata, monster metadata, and calculation logic
remain upstream code.
`;
writeFileSync(join(outputDir, "NOTICE"), notice);

const bytes = readFileSync(join(outputDir, "engine.generated.js")).byteLength;
console.log(`Bundled OSRS Wiki DPS engine ${revision} (${Math.round(bytes / 1024)} KiB).`);

if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
