#!/usr/bin/env node
/**
 * seed.js — Load nsu_indoor_map_merged_clean.geojson into Supabase map_features.
 *
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed.js
 *
 * One row per GeoJSON feature. Transit features are keyed by node_id so that
 * same-XY pairs (L1/L2 lifts at identical coordinates) are distinct rows.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON_PATH = join(__dirname, "..", "nsu_indoor_map_merged_clean.geojson");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function featureToRow(feature, index) {
  const p = feature.properties;
  const geom = feature.geometry;

  // Determine the stable external ID for this feature:
  // - transit: use node_id (L1/L2 pairs share XY but differ in node_id)
  // - path:    use path_id
  // - poi:     use name+building+level combo (slugified)
  // - footprint: use "footprint_L{level}"
  let feature_id;
  if (p.type === "transit") {
    feature_id = p.node_id;
  } else if (p.type === "path") {
    feature_id = p.path_id;
  } else if (p.type === "poi") {
    const slug = (p.name ?? "poi")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    feature_id = `poi_${p.building ?? "unk"}_L${p.level}_${slug}`;
  } else if (p.type === "footprint") {
    feature_id = `footprint_L${p.level}`;
  } else {
    feature_id = `feature_${index}`;
  }

  return {
    feature_id,
    geometry: geom,      // stored as jsonb — matches §4.2 spec
    properties: p,
    feature_type: p.type,
    level: p.level ?? null,
  };
}

async function main() {
  console.log(`Loading ${GEOJSON_PATH} …`);
  const raw = readFileSync(GEOJSON_PATH, "utf-8");
  const fc = JSON.parse(raw);
  const features = fc.features;
  console.log(`  ${features.length} features loaded.`);

  const rows = features.map((f, i) => featureToRow(f, i));

  // Upsert in batches of 50 to stay inside Supabase request limits.
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("map_features")
      .upsert(batch, { onConflict: "feature_id" });
    if (error) {
      console.error(`  Batch ${i}-${i + batch.length} FAILED:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`  Upserted ${inserted}/${rows.length} …`);
  }

  console.log("Seed complete ✓");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
