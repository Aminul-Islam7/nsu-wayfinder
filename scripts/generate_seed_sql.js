#!/usr/bin/env node
/**
 * generate_seed_sql.js — converts nsu_indoor_map_merged_clean.geojson
 * into a seed_data.sql file for direct MCP execution.
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON = join(__dirname, "..", "nsu_indoor_map_merged_clean.geojson");
const OUT_SQL = join(__dirname, "seed_data.sql");

function featureId(f) {
  const p = f.properties;
  if (p.type === "transit") return p.node_id;
  if (p.type === "path")    return p.path_id;
  if (p.type === "poi") {
    const slug = (p.name ?? "poi")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    return `poi_${p.building ?? "unk"}_L${p.level}_${slug}`;
  }
  return `footprint_L${p.level}`;
}

const fc = JSON.parse(readFileSync(GEOJSON, "utf-8"));
const esc = (s) => s.replace(/'/g, "''");

const values = fc.features.map((f) => {
  const fid  = featureId(f);
  const geom = esc(JSON.stringify(f.geometry));
  const prop = esc(JSON.stringify(f.properties));
  const ft   = f.properties.type;
  const lvl  = f.properties.level != null ? String(f.properties.level) : "NULL";
  return `('${fid}','${geom}'::jsonb,'${prop}'::jsonb,'${ft}',${lvl})`;
});

const sql = `-- NSU Wayfinder seed — ${fc.features.length} features
INSERT INTO public.map_features (feature_id, geometry, properties, feature_type, level)
VALUES
${values.join(",\n")}
ON CONFLICT (feature_id) DO UPDATE
  SET geometry   = EXCLUDED.geometry,
      properties = EXCLUDED.properties,
      updated_at = now();
`;

writeFileSync(OUT_SQL, sql, "utf-8");
console.log(`Wrote ${values.length} rows to ${OUT_SQL}`);
