# Vibecoding Memory & Scratchpad

> *Purpose: A living document to log things learned, persistent bugs, or temporary states during development. Append notes here as we go to maintain context across sessions.*

## Current Status
- Phase 1 complete: scaffold + schema + seed done.
- Supabase project: `nsu-wayfinder` (id: `newohsmvykuelitzjrik`, region: ap-southeast-1)
- All 147 clean features seeded into `map_features`.

## Technical Decisions & Lessons Learned

### 2026-06-21 — Degenerate path fix decision
**Problem**: `path_L1_001` and `path_L2_001` were zero-length LineStrings — both vertices identical at `[90.426206, 23.815926]`.

**Decision: DELETED** (not fixed/repaired).

**Reasoning**:
- Coordinate `[90.426206, 23.815926]` is *outside* the building footprint. The footprint's northernmost vertex is `23.8158427`; the degenerate point sits at `23.815926` — ~6 m north of the roof line. It's a digitizing artifact (cursor click on empty space), not a real corridor gap.
- The rest of the path mesh (L1: paths 002–038; L2: paths 002–015) is fully connected across the corridor grid without any bridging needed at that coordinate.
- Fabricating a replacement path from an out-of-bounds point would inject a phantom edge into the graph, potentially routing users through a wall.
- Deleting is safe: Turf `nearestPointOnLine` will never crash on the remaining valid paths, and graphology will build a clean edge-set.

**Result**: Cleaned file saved as `nsu_indoor_map_merged_clean.geojson` (147 features, was 149).

### 2026-06-21 — accessible_via_path strategy
Field is `null` on all POIs in the source GeoJSON.

**Decision: Leave null for MVP.**

Routing for Phase 2 will use Turf `nearestPointOnLine` to snap any POI or QR-decoded position onto the nearest path segment at runtime. The `accessible_via_path` field is semantically dead weight for now but preserved in schema for a future admin tool that could explicitly link POIs to specific corridor segments (useful for complex indoor geometries where nearest-path snap could pick the wrong corridor).

### 2026-06-21 — Graph node keying
Transit nodes (lifts/staircases) at the same physical XY on L1 and L2 (e.g. `nac_lift_1_L1` and `nac_lift_1_L2` both at `[90.4257158, 23.8154311]`) must be keyed by `node_id` string, NOT by coordinate string. Coordinate-based dedup would collapse vertical edges into a single node, breaking multi-floor routing.

### 2026-06-21 — Vite scaffold wiped root
`create-vite --overwrite` on the project root deleted `.ai/` and the original GeoJSON. All `.ai/` files recreated from memory. The original GeoJSON is not restored (not needed — only the clean version is used going forward). `AGENTS.md` also lost — should be recreated if needed.

## Supabase Schema Notes
- Table: `map_features` — `feature_id` (unique), `geometry` (jsonb), `properties` (jsonb), `feature_type`, `level`
- RLS: SELECT open to `public`; INSERT/UPDATE/DELETE gated on `admin_allowlist` table
- RPC: `get_feature_collection(p_level integer DEFAULT NULL)` → returns GeoJSON FeatureCollection
- Service key needed for seed script (bypasses RLS); anon key for frontend reads
