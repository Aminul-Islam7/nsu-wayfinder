#!/usr/bin/env node
/**
 * clean_geojson.js
 * Reads nsu_indoor_map_merged.geojson, removes degenerate zero-length
 * LineStrings (path_L1_001, path_L2_001), writes cleaned copy.
 *
 * Decision: DELETE (not fix) — coordinate [90.426206, 23.815926] is
 * outside the building footprint (north limit ~23.8158) and is a digitizing
 * artifact. The existing path mesh is fully connected without it.
 *
 * Run: node scripts/clean_geojson.js
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC  = join(__dirname, "..", "nsu_indoor_map_merged.geojson");
const DEST = join(__dirname, "..", "nsu_indoor_map_merged_clean.geojson");

const DEGENERATE_IDS = new Set(["path_L1_001", "path_L2_001"]);

const raw = readFileSync(SRC, "utf-8");
const fc = JSON.parse(raw);

const before = fc.features.length;
fc.features = fc.features.filter((f) => {
  const pid = f.properties?.path_id;
  if (pid && DEGENERATE_IDS.has(pid)) {
    console.log(`  Removed degenerate path: ${pid}  coords=${JSON.stringify(f.geometry.coordinates[0])}`);
    return false;
  }
  return true;
});
const after = fc.features.length;
console.log(`  Removed ${before - after} features (${before} → ${after})`);

writeFileSync(DEST, JSON.stringify(fc, null, 2), "utf-8");
console.log(`  Written: ${DEST}`);
